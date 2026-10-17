"use client";

import { useMemo, useState } from "react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBootstrapDaFicha, useEditorDeFichas } from "@/hooks/crm-fields/useFichas";
import type { LayoutDocumentV1 } from "@/lib/crm-fields/tipos";
import { useT } from "@/lib/i18n/IdiomaProvider";

import { BarraDePublicacao } from "./_components/BarraDePublicacao";
import { CatalogoDeCampos } from "./_components/CatalogoDeCampos";
import { EditorDeLayout } from "./_components/EditorDeLayout";
import { PreviaDaFicha } from "./_components/PreviaDaFicha";

export function FichasClient() {
  const t = useT();
  const { data, isLoading, error, refetch } = useEditorDeFichas();
  const bootstrap = useBootstrapDaFicha();

  // O documento em edição é DERIVADO: o local (quando a pessoa mexeu ou
  // carregou uma versão) ou o rascunho do servidor. Sem efeito sincronizando
  // estado — Descartar simplesmente volta a derivar do servidor.
  const [docLocal, setDocLocal] = useState<LayoutDocumentV1 | null>(null);
  const [sujo, setSujo] = useState(false);

  const base = useMemo(
    () => data?.layout?.draft_document ?? data?.release_ativa?.document ?? null,
    [data],
  );
  const doc = docLocal ?? base;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("Não deu para carregar o editor")}</CardTitle>
          <CardDescription>{t("A ficha que a equipe vê não muda enquanto o editor não carrega.")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => void refetch()}>
            {t("Tentar de novo")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data.layout) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("Comece a personalizar a ficha")}</CardTitle>
          <CardDescription>
            {t("O primeiro passo cria um rascunho em branco: você monta os grupos e os campos, e nada muda para a equipe até publicar.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            disabled={bootstrap.isPending}
            onClick={() =>
              bootstrap.mutate(undefined, {
                onError: (e) => showApiError(e),
              })
            }
          >
            {bootstrap.isPending ? t("Preparando…") : t("Começar a personalizar")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const alterar = (novo: LayoutDocumentV1) => {
    setDocLocal(novo);
    setSujo(true);
  };

  return (
    <div className="space-y-4">
      <BarraDePublicacao
        doc={doc}
        sujo={sujo}
        layout={data.layout}
        releaseAtiva={data.release_ativa}
        historico={data.historico}
        aoSincronizar={() => setSujo(false)}
        aoDescartar={() => {
          setDocLocal(null);
          setSujo(false);
        }}
        aoCarregarDocumento={(d) => {
          setDocLocal(d);
          setSujo(true);
        }}
      />
      <Tabs defaultValue="layout">
        <TabsList>
          <TabsTrigger value="layout">{t("Layout da ficha")}</TabsTrigger>
          <TabsTrigger value="campos">{t("Catálogo de campos")}</TabsTrigger>
          <TabsTrigger value="previa">{t("Prévia")}</TabsTrigger>
        </TabsList>
        <TabsContent value="layout" className="mt-4">
          {doc ? (
            <EditorDeLayout doc={doc} fields={data.fields} onChange={alterar} />
          ) : (
            <p className="text-sm text-muted-foreground">{t("Sem rascunho — carregue uma versão do histórico acima.")}</p>
          )}
        </TabsContent>
        <TabsContent value="campos" className="mt-4">
          <CatalogoDeCampos fields={data.fields} doc={doc} />
        </TabsContent>
        <TabsContent value="previa" className="mt-4">
          {doc ? (
            <PreviaDaFicha doc={doc} fields={data.fields} />
          ) : (
            <p className="text-sm text-muted-foreground">{t("Sem rascunho para pré-visualizar.")}</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
