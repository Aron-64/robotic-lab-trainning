"""Download a model snapshot without importing code from that model repository."""
import argparse
import os
p = argparse.ArgumentParser()
p.add_argument('--provider', choices=['huggingface', 'modelscope'], required=True)
p.add_argument('--repo', required=True)
p.add_argument('--target', required=True)
p.add_argument('--revision', default='')
a = p.parse_args()
if a.provider == 'huggingface':
    from huggingface_hub import snapshot_download
    snapshot_download(repo_id=a.repo, local_dir=a.target, revision=a.revision or None, token=os.getenv('HF_TOKEN') or None)
else:
    from modelscope import snapshot_download
    options = dict(model_id=a.repo, local_dir=a.target)
    if a.revision:
        options['revision'] = a.revision
    if os.getenv('MODELSCOPE_API_TOKEN'):
        options['token'] = os.environ['MODELSCOPE_API_TOKEN']
    snapshot_download(**options)
print('Weight snapshot downloaded successfully.', flush=True)
