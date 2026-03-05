import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["just-bash", "bash-tool", "@mongodb-js/zstd"],
};

export default withWorkflow(nextConfig);
