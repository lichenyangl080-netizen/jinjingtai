# 第三方内容

本目录是进境台 Windows 桌面软件。外层 engineering-notebook 的原始源码与 Apache-2.0 LICENSE 保留；其许可不代替进境台自身代码的授权。

- Electron：MIT，发行包保留 LICENSE 和 LICENSES.chromium.html。
- Node.js：MIT及其内含组件许可，发行包内置构建工具链的Node运行时；完整许可保存在源码的 docs/licenses/Node-24.19.0.txt，发行包放在 licenses/Node-24.19.0.txt。官方原文来自 https://github.com/nodejs/node/blob/v24.19.0/LICENSE ，不作修改；打包时核对实际Node版本对应的许可文件。
- React / React DOM：MIT；Vite 和构建依赖按各自许可证保留在 node_modules。
- Phosphor Icons：MIT，界面图标来自 @phosphor-icons/react。
- Noto Serif SC / Noto Sans SC：SIL Open Font License 1.1，字体及 OFL 文件随界面一起打包。
- 水墨插画、墨圈、按钮和选中竖线：为本项目生成的独立 PNG 素材。

Node、React、React DOM和Phosphor完整许可证随包放在licenses目录，字体OFL随字体资产分发，Electron与Chromium告知由原始发行包保留。这份说明不代替各依赖的完整许可证；进境台自身代码采用LICENSE中的MIT许可。
