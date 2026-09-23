import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  // Vercel and .env files hand an unset value over as "".
  DATABASE_AUTH_TOKEN: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  S3_ENDPOINT: z.url({ protocol: /^https?$/ }),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
});

export type Env = z.infer<typeof schema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const names = result.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid environment: ${names}`);
  }
  return result.data;
}

export const env = parseEnv(process.env);
