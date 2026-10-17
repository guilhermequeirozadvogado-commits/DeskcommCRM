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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useCriarCampo, useEditarCampo } from "@/hooks/crm-fields/useFichas";
import type { FieldDefinition, LayoutDocumentV1 } from "@/lib/crm-fields/tipos";
import { useT } from "@/lib/i18n/IdiomaProvider";
import { Plus } from "@/lib/ui/icons";

/**
 * O catálogo: cada campo com identidade própria (a chave de armazenamento é
 * imutável — o aviso na criação diz isso) e ciclo ativo/arquivado. Renomear o
 * rótulo nunca toca a chave, e opção de lista renomeia sem trocar o id: é o
 * contrato que impede valor órfão. Excluir não existe — arquivar preserva o que
 * já foi preenchido.
 */

const TIPOS: { valor: string; rotulo: string }[] = [
  { valor: "text", rotulo: "Texto" },
  { valor: "number", rotulo: "Número" },
  { valor: "currency", rotulo: "Dinheiro" },
  { valor: "date", rotulo: "Data" },
  { valor: "select", rotulo: "Lista" },
];

export function CatalogoDeCampos({ fields, doc }: { fields: FieldDefinition[]; doc: LayoutDocumentV1 | null }) {
  const t = useT();
  const criar = useCriarCampo();
  const editar = useEditarCampo();

  const noLayout = new Set(doc?.abas.flatMap((a) => a.grupos.flatMap((g) => g.campos.map((c) => c.field_id))) ?? []);

  const [criando, setCriando] = useState(false);
  const [novoRotulo, setNovoRotulo] = useState("");
  const [novoTipo, setNovoTipo] = useState("text");
  const [novaDica, setNovaDica] = useState("");
  const [novasOpcoes, setNovasOpcoes] = useState("");

  const [editando, setEditando] = useState<FieldDefinition | null>(null);
  const [rotuloEditado, setRotuloEditado] = useState("");
  const [opcoesEditadas, setOpcoesEditadas] = useState<{ id: string; label: string; archived?: boolean }[]>([]);
  const [novaOpcao, setNovaOpcao] = useState("");
  const [arquivando, setArquivando] = useState<FieldDefinition | null>(null);

  const abrirEdicao = (f: FieldDefinition) => {
    setEditando(f);
    setRotuloEditado(f.label);
    setOpcoesEditadas(f.options.map((o) => ({ ...o })));
  };

  const aoCriar = () => {
    const options = novasOpcoes
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((label) => ({ label }));
    criar.mutate(
      {
        entity_kind: "contact",
        label: novoRotulo.trim(),
        field_type: novoTipo,
        hint: novaDica.trim() || null,
        ...(novoTipo === "select" ? { options } : {}),
      },
      {
        onSuccess: () => {
          setCriando(false);
          setNovoRotulo("");
          setNovaDica("");
          setNovasOpcoes("");
          toast.success(t("Campo criado. Adicione-o ao layout para ele aparecer na ficha."));
        },
        onError: (e) => showApiError(e),
      },
    );
  };

  const aoSalvarEdicao = () => {
    if (!editando) return;
    editar.mutate(
      {
        id: editando.id,
        patch: {
          label: rotuloEditado.trim(),
          ...(editando.field_type === "select" ? { options: opcoesEditadas } : {}),
        },
      },
      {
        onSuccess: () => {
          setEditando(null);
          toast.success(t("Campo atualizado — os valores já preenchidos continuam onde estão."));
        },
        onError: (e) => showApiError(e),
      },
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {t("A chave de armazenamento nasce do rótulo e não muda depois — renomear é seguro.")}
        </p>
        <Button size="sm" onClick={() => setCriando(true)}>
          <Plus className="mr-1 size-4" />
          {t("Novo campo")}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("Rótulo")}</TableHead>
            <TableHead>{t("Tipo")}</TableHead>
            <TableHead>{t("Chave")}</TableHead>
            <TableHead>{t("Estado")}</TableHead>
            <TableHead>{t("Na ficha?")}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {fields.map((f) => (
            <TableRow key={f.id}>
              <TableCell className="font-medium">{f.label}</TableCell>
              <TableCell><Badge variant="secondary">{f.field_type}</Badge></TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{f.storage_key}</TableCell>
              <TableCell>
                {f.lifecycle === "archived" ? (
                  <Badge variant="outline">{t("arquivado")}</Badge>
                ) : (
                  <Badge variant="outline" className="border-emerald-500/50 text-emerald-600 dark:text-emerald-400">
                    {t("ativo")}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {noLayout.has(f.id) ? t("Sim") : t("Não")}
              </TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="sm" onClick={() => abrirEdicao(f)}>
                  {t("Editar")}
                </Button>
                {f.lifecycle === "active" ? (
                  <Button variant="ghost" size="sm" onClick={() => setArquivando(f)}>
                    {t("Arquivar")}
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" disabled={editar.isPending}
                    onClick={() => editar.mutate({ id: f.id, patch: { lifecycle: "active" } }, { onError: (e) => showApiError(e) })}>
                    {t("Reativar")}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={criando} onOpenChange={setCriando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Novo campo da ficha do contato")}</DialogTitle>
            <DialogDescription>
              {t("O tipo e a chave de armazenamento não mudam depois de criar; o rótulo muda quando quiser.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="novo-rotulo">{t("Rótulo")}</Label>
              <Input id="novo-rotulo" value={novoRotulo} onChange={(e) => setNovoRotulo(e.target.value)}
                placeholder={t("Instituição financeira")} />
            </div>
            <div>
              <Label>{t("Tipo")}</Label>
              <Select value={novoTipo} onValueChange={setNovoTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map((tp) => (
                    <SelectItem key={tp.valor} value={tp.valor}>{t(tp.rotulo)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {novoTipo === "select" ? (
              <div>
                <Label htmlFor="novas-opcoes">{t("Opções (uma por linha)")}</Label>
                <Textarea id="novas-opcoes" rows={4} value={novasOpcoes} onChange={(e) => setNovasOpcoes(e.target.value)} />
              </div>
            ) : null}
            <div>
              <Label htmlFor="nova-dica">{t("Dica (opcional)")}</Label>
              <Input id="nova-dica" value={novaDica} onChange={(e) => setNovaDica(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCriando(false)}>{t("Cancelar")}</Button>
            <Button disabled={!novoRotulo.trim() || criar.isPending} onClick={aoCriar}>
              {criar.isPending ? t("Criando…") : t("Criar campo")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editando !== null} onOpenChange={(aberto) => { if (!aberto) setEditando(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Editar campo")}</DialogTitle>
            <DialogDescription>
              {editando ? `${t("Chave")}: ${editando.storage_key}` : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="rotulo-editado">{t("Rótulo")}</Label>
              <Input id="rotulo-editado" value={rotuloEditado} onChange={(e) => setRotuloEditado(e.target.value)} />
            </div>
            {editando?.field_type === "select" ? (
              <div className="space-y-2">
                <Label>{t("Opções — renomeie o texto; a chave de cada uma não muda")}</Label>
                {opcoesEditadas.map((o, i) => (
                  <div key={o.id} className="flex items-center gap-2">
                    <Input
                      aria-label={t("Rótulo da opção")}
                      value={o.label}
                      className={o.archived ? "opacity-60" : undefined}
                      onChange={(e) =>
                        setOpcoesEditadas((atual) => atual.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                      }
                    />
                    <Button type="button" variant="ghost" size="sm"
                      onClick={() =>
                        setOpcoesEditadas((atual) => atual.map((x, j) => (j === i ? { ...x, archived: !x.archived } : x)))
                      }>
                      {o.archived ? t("Reativar") : t("Arquivar")}
                    </Button>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={t("Texto da nova opção")}
                    placeholder={t("Texto da nova opção")}
                    value={novaOpcao}
                    onChange={(e) => setNovaOpcao(e.target.value)}
                  />
                  <Button type="button" variant="outline" size="sm" disabled={!novaOpcao.trim()}
                    onClick={() => {
                      setOpcoesEditadas((atual) => [...atual, { id: `opt-${Date.now()}`, label: novaOpcao.trim() }]);
                      setNovaOpcao("");
                    }}>
                    <Plus className="mr-1 size-4" />
                    {t("Nova opção")}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>{t("Cancelar")}</Button>
            <Button disabled={!rotuloEditado.trim() || editar.isPending} onClick={aoSalvarEdicao}>
              {editar.isPending ? t("Salvando…") : t("Salvar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={arquivando !== null} onOpenChange={(aberto) => { if (!aberto) setArquivando(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Arquivar este campo?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("O campo sai das escolhas novas. O que já foi preenchido continua gravado e legível; dá para reativar depois.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (arquivando) {
                  editar.mutate(
                    { id: arquivando.id, patch: { lifecycle: "archived" } },
                    { onError: (e) => showApiError(e) },
                  );
                }
                setArquivando(null);
              }}
            >
              {t("Arquivar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
