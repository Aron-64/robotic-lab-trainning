"""Platform adapter: use the project's configuration objects, never a shell command."""
import argparse, dataclasses, importlib.util, json, os, pathlib, sys
p=argparse.ArgumentParser();p.add_argument('config');p.add_argument('--preflight',action='store_true');args=p.parse_args()
c=json.loads(pathlib.Path(args.config).read_text());project=pathlib.Path(c['project'])
sys.path.insert(0,str(project/'src'));sys.path.insert(0,str(project));os.chdir(project)
import torch
import openpi.training.config as configs
cfg=configs.get_config(c['configName'])
# The supplied OpenPI entry uses torch.cuda/NCCL. Require CUDA-compatible runtime on P800.
if not torch.cuda.is_available():raise RuntimeError('此 OpenPI 入口需要 torch.cuda 兼容后端；当前环境不可用，禁止退回 CPU。')
count=torch.cuda.device_count()
if count<c['gpuCount']:raise RuntimeError('PyTorch 可见设备少于请求数量。')
if c['batchSize']%c['gpuCount']:raise RuntimeError('全局 Batch Size 必须能被设备数量整除。')
x=torch.ones(4,device='cuda:0');value=(x+x).sum().item();torch.cuda.synchronize();del x
if 'repo_id' not in {f.name for f in dataclasses.fields(cfg.data)}:raise RuntimeError('数据配置不支持 repo_id 路径映射，需要项目专用适配。')
fields={f.name for f in dataclasses.fields(cfg)}
required={'pytorch_weight_path','pytorch_training_precision','checkpoint_base_dir','assets_base_dir','num_train_steps','wandb_enabled'}
if not required<=fields:raise RuntimeError('TrainConfig 与 OpenPI PyTorch 适配器不兼容。')
# Preflight imports the actual entry and validates the interface without loading model weights.
spec=importlib.util.spec_from_file_location('robotic_lab_training_entry',c['entry']);entry=importlib.util.module_from_spec(spec);spec.loader.exec_module(entry)
if not callable(getattr(entry,'train_loop',None)):raise RuntimeError('入口未提供 train_loop(config)。')
if args.preflight:
 print('ROBOTIC_LAB_PREFLIGHT='+json.dumps({'python':sys.version.split()[0],'torch':torch.__version__,'devices':[torch.cuda.get_device_name(i) for i in range(count)],'deviceCount':count,'tensorCheck':value,'configName':c['configName'],'dataConfig':type(cfg.data).__name__,'notice':'设备与接口检查通过；未验证完整数据、模型加载或多卡通信。'},ensure_ascii=False));sys.exit(0)
data=dataclasses.replace(cfg.data,repo_id=c['dataset'])
if c.get('assetId'):
 if 'assets' not in {f.name for f in dataclasses.fields(data)}:raise RuntimeError('数据配置缺少 assets 字段')
 assets=getattr(data,'assets');data=dataclasses.replace(data,assets=dataclasses.replace(assets,asset_id=c['assetId']))
schedule=dataclasses.replace(cfg.lr_schedule,peak_lr=c['learningRate'])
cfg=dataclasses.replace(cfg,data=data,exp_name=c['experiment'],checkpoint_base_dir=c['outputBase'],assets_base_dir=c['assets'],pytorch_weight_path=None if c.get('resumeFrom') is not None else c.get('weights'),resume=c.get('resumeFrom') is not None,overwrite=False,num_train_steps=c['steps'],batch_size=c['batchSize'],num_workers=c['workers'],save_interval=c['saveInterval'],log_interval=c['logInterval'],seed=c['seed'],lr_schedule=schedule,pytorch_training_precision=c['precision'],wandb_enabled=False)
if pathlib.Path(cfg.checkpoint_dir).resolve()!=pathlib.Path(c['checkpointDir']).resolve():raise RuntimeError('配置输出路径不一致')
# The supplied trainer can omit the final checkpoint when steps is not divisible
# by save_interval. Force its normal save routine on the final completed step.
original_save=getattr(entry,'save_checkpoint',None)
if callable(original_save):
 def save_final(model,optimizer,global_step,config,is_main,data_config):
  if global_step == config.num_train_steps:
   config=dataclasses.replace(config,save_interval=1)
  return original_save(model,optimizer,global_step,config,is_main,data_config)
 entry.save_checkpoint=save_final
entry.init_logging()
entry.train_loop(cfg)
