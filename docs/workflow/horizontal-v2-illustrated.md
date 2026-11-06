# 横版使用流程图 · 适中详度

![使用流程](robotic-lab-workflow-horizontal-v2.png)

中文、横版 paper-figure，无图内总标题。模型与数据准备汇合到训练配置，预检通过后排队执行，记录日志和 Loss、保存快照；失败返回调整配置，续训创建独立任务后重新预检。

使用内置 imagegen 生成及校正。提示词见 horizontal-v2-prompt.txt。本图描述使用流程，不表示 P800 真机训练已完成验证。
