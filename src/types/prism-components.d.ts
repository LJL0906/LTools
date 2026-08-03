/**
 * prismjs 的语言组件按子路径引入（如 prism-json），@types/prismjs 未覆盖这些入口，
 * 通配声明避免 TS7016。
 */
declare module "prismjs/components/*";
