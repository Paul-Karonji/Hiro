import { DefaultMemoryService } from "../memory/service";
import type { MemoryPlugin } from "./types";

export const defaultMemoryPlugin: MemoryPlugin = {
  id: "default-memory",
  createService() {
    return new DefaultMemoryService();
  },
};
