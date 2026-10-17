"use client";

import { useState } from "react";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePublicarLayout, useSalvarRascunho, type PonteiroDoLayout, type ReleaseResumo } from "@/hooks/crm-fields/useFichas";
import type { LayoutDocumentV1 } from "@/lib/crm-fields/tipos";
import { useT } from "@/lib/i18n/IdiomaProvider";

/**
 * A barra de rascunho → publicação, no desenho da PublishBar dos follow-ups:
 * Salvar grava o rascunho (CAS por draft_revision), Publicar cria a release e
 * troca o ponteiro (CAS por release ativa — 409 quando alguém publicou antes),
 * Descartar volta ao que o servidor tem. O histórico é informativo; a versão
 * publicada pode ser recarregada no rascunho.
 */
export function BarraDePublicacao({
  doc,
  sujo,
  layout,
  releaseAtiva,
  historico,
  aoSincronizar,
  aoDescartar,
  aoCarregarDocumento,
}: {
  doc: LayoutDocumentV1 | null;
  sujo: boolean;
  layout: PonteiroDoLayout;
  releaseAtiva: (ReleaseResumo & { document: LayoutDocumentV1 }) | null;
  historico: ReleaseResumo[];
  aoSincronizar: () => void;
  aoDescartar: () => void;
  aoCarregarDocumento: (d: LayoutDocumentV1) => void;
}) {
  const t = useT();
  const salvar = useSalvarRascunho();
  const publicar = usePublicarLayout();
  const [confirmaPublicar, setConfirmaPublicar] = useState(false);

  const versaoAtiva = historico.find((h) => h.id === layout.active_release_id)?.version ?? null;

  const aoSalvar = () => {
    if (!doc) return;
    salvar.mutate(
      { document: doc, expected_draft_revision: layout.draft_revision },
      {
        onSuccess: () => {
          aoSincronizar();
          toast.success(t("Rascunho salvo. Nada mudou para a equipe ainda."));
        },
        onError: (e) => showApiError(e),
      },
    );
  };

  const aoPublicar = () => {
    if (!doc) return;
    publicar.mutate(
      { document: doc, expected_release_id: layout.active_release_id },
      {
        onSuccess: () => {
          aoSincronizar();
          toast.success(t("Layout publicado — a ficha de toda a equipe usa a nova versão."));
        },
        onError: (e) => showApiError(e),
      },
    );
    setConfirmaPublicar(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {sujo ? (
          <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
            {t("Alterações não salvas")}
          </Badge>
        ) : (
          <Badge variant="outline">{t("Rascunho em dia")}</Badge>
        )}
        <span className="truncate text-xs text-muted-foreground">
          {versaoAtiva !== null
            ? `${t("Versão publicada")}: v${versaoAtiva}`
            : t("Nenhuma versão publicada — a equipe vê o modelo padrão.")}
        </span>
      </div>
      {releaseAtiva ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => aoCarregarDocumento(releaseAtiva.document)}
          title={t("Substitui o rascunho pelo conteúdo da versão publicada.")}
        >
          {t("Carregar versão publicada")}
        </Button>
      ) : null}
      <Button variant="ghost" size="sm" disabled={!sujo} onClick={aoDescartar}>
        {t("Descartar")}
      </Button>
      <Button variant="outline" size="sm" disabled={!doc || !sujo || salvar.isPending} onClick={aoSalvar}>
        {salvar.isPending ? t("Salvando…") : t("Salvar rascunho")}
      </Button>
      <Button size="sm" disabled={!doc || publicar.isPending} onClick={() => setConfirmaPublicar(true)}>
        {publicar.isPending ? t("Publicando…") : t("Publicar")}
      </Button>

      <AlertDialog open={confirmaPublicar} onOpenChange={setConfirmaPublicar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Publicar o layout da ficha?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("A ficha do contato de toda a equipe passa a usar esta versão agora. As versões anteriores ficam no histórico.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction onClick={aoPublicar}>{t("Publicar")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
