// 前端页面/market/资金与钱包组件.js

/**
 * 资金域 - 统一接口暴露层 (Barrel File)
 * 通过模块化拆分，降低代码耦合度
 */

// 导出充值模块
export { openRechargeModal } from "./资金与钱包_充值组件.js";

// 导出提现模块
export { openWithdrawModal } from "./资金与钱包_提现组件.js";