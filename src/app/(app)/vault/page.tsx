import type { Metadata } from "next";
import { VaultWorkspace } from "@/components/vault/vault-workspace";

export const metadata: Metadata = { title: "Strength Vault" };

export default function VaultPage() {
  return <VaultWorkspace />;
}