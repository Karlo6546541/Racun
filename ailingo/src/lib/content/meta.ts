import raw from "@content/meta.json";
import { MetaSchema, type Meta } from "./schema";

/** meta.json is bundled at build time and validated once. */
export const META: Meta = MetaSchema.parse(raw);
