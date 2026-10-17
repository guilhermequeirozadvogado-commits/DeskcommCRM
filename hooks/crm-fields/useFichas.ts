"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import type { FieldDefinition, LayoutDocumentV1, ModeloDaFicha } from "@/lib/crm-fields/tipos";

/**
 * Leitura e escrita da tela Configurações → Fichas e campos, no molde de
 * `hooks/followup/useFollowupFlow`: mutação → invalidate → a tela relê. Não há
 * cache otimista aqui de propósito — o contrato das rotas é CAS (409 quando
 * outra pessoa mexeu), e reler é o preço honesto de uma tela de configuração.
 */

export const CHAVE_DO_EDITOR = ["crm-fields", "editor"] as const;
export const CHAVE_DO_MODELO = ["crm-fields", "modelo", "contact"] as const;

export interface PonteiroDoLayout {
  id: string;
  entity_kind: "contact" | "lead";
  draft_document: LayoutDocumentV1 | null;
  draft_revision: number;
  draft_base_release_id: string | null;
  active_release_id: string | null;
  updated_at: string;
}

export interface ReleaseResumo {
  id: string;
  version: number;
  created_at: string;
}

export interface CargaDoEditor {
  layout: PonteiroDoLayout | null;
  release_ativa: (ReleaseResumo & { document: LayoutDocumentV1 }) | null;
  historico: ReleaseResumo[];
  fields: FieldDefinition[];
}

export function useEditorDeFichas() {
  return useQuery({
    queryKey: CHAVE_DO_EDITOR,
    queryFn: () => apiClient.get<{ data: CargaDoEditor }>("/api/v1/crm/layouts/contact"),
    select: (r) => r.data,
    staleTime: 15_000,
  });
}

export function useModeloDaFicha() {
  return useQuery({
    queryKey: CHAVE_DO_MODELO,
    queryFn: () =>
      apiClient.get<{ data: { modelo: ModeloDaFicha; release_id: string | null } }>(
        "/api/v1/crm/layouts/resolve?entity_kind=contact",
      ),
    select: (r) => r.data.modelo,
    staleTime: 60_000,
  });
}

function useRelerEditor() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: CHAVE_DO_EDITOR });
    void qc.invalidateQueries({ queryKey: CHAVE_DO_MODELO });
  };
}

export function useBootstrapDaFicha() {
  const reler = useRelerEditor();
  return useMutation({
    mutationFn: () => apiClient.post<unknown>("/api/v1/crm/layouts/contact/bootstrap", {}),
    onSettled: reler,
  });
}

export function useSalvarRascunho() {
  const reler = useRelerEditor();
  return useMutation({
    mutationFn: (args: { document: LayoutDocumentV1; expected_draft_revision: number }) =>
      apiClient.put<{ data: { draft_revision: number } }>("/api/v1/crm/layouts/contact/draft", args),
    onSettled: reler,
  });
}

export function usePublicarLayout() {
  const reler = useRelerEditor();
  return useMutation({
    mutationFn: (args: { document: LayoutDocumentV1; expected_release_id: string | null }) =>
      apiClient.post<{ data: { release_id: string } }>("/api/v1/crm/layouts/contact/publish", args),
    onSettled: reler,
  });
}

export interface NovoCampo {
  entity_kind: "contact";
  label: string;
  field_type: string;
  hint?: string | null;
  options?: { label: string }[];
}

export interface PatchDeCampo {
  label?: string;
  hint?: string | null;
  options?: { id: string; label: string; archived?: boolean }[];
  lifecycle?: "active" | "archived";
}

export function useCriarCampo() {
  const reler = useRelerEditor();
  return useMutation({
    mutationFn: (campo: NovoCampo) =>
      apiClient.post<{ data: { field: FieldDefinition } }>("/api/v1/crm/fields", campo),
    onSettled: reler,
  });
}

export function useEditarCampo() {
  const reler = useRelerEditor();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: PatchDeCampo }) =>
      apiClient.patch<{ data: { field: FieldDefinition } }>(
        `/api/v1/crm/fields/${encodeURIComponent(id)}`,
        patch,
      ),
    onSettled: reler,
  });
}
