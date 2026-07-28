import { IdentityGate } from "@/components/identity-gate";
import { identityModeFromEnvironment } from "@/domain/identity";

export default function Home() {
  return <IdentityGate mode={identityModeFromEnvironment(process.env)} />;
}
