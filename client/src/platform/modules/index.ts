/** Frontend platform-modules — public entry point. */
export * from "./types";
export {
  registerClientModule,
  listClientModules,
  getClientModule,
  __resetClientRegistryForTests,
} from "./registry";
export { ModuleRoutes } from "./route-composer";
export { getNavEntries } from "./nav-composer";
export type { NavEntry } from "./nav-composer";
