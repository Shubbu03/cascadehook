import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CodeBlock, Pre } from "fumadocs-ui/components/codeblock";

export async function ReceiverSource({
  file,
}: {
  file: "receiver-core.mjs" | "node-receiver.mjs" | "bun-receiver.mjs";
}) {
  const code = await readFile(join(process.cwd(), "public/examples", file), "utf8");
  return (
    <CodeBlock title={file}>
      <Pre><code>{code}</code></Pre>
    </CodeBlock>
  );
}
