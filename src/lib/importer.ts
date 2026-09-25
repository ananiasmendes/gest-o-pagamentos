import * as XLSX from 'xlsx';
import { supabase } from './supabase';
import { precoVigente } from './precos';
import { chave, parseData, parseNumero } from './format';
import { TIPOS, type Entrada, type Modelo, type Oficina, type Operacao, type Pagamento, type Preco, type Tipo } from './types';

export type TipoImport = 'entradas' | 'pagamentos' | 'precos';

// ---------------- Leitura do arquivo ----------------------------------

export interface Arquivo { nome: string; abas: { nome: string; linhas: unknown[][] }[] }

export async function lerArquivo(file: File): Promise<Arquivo> {
  const ehTexto = /\.(csv|txt|tsv)$/i.test(file.name);
  const wb = ehTexto
    ? XLSX.read(await file.text(), { type: 'string', raw: true })
    : XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return {
    nome: file.name,
    abas: wb.SheetNames.map((n) => ({
      nome: n,
      linhas: (XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: false }) as unknown[][])
        .filter((l) => l.some((c) => c !== null && String(c).trim() !== '')),
    })),
  };
}

/** Sugere a aba certa pelo nome. */
export function abaSugerida(arq: Arquivo, tipo: TipoImport) {
  const alvos: Record<TipoImport, string[]> = {
    entradas: ['entradas', 'entrada', 'producao'],
    pagamentos: ['pagamentos', 'pagamento'],
    precos: ['precos', 'preco', 'valor das pecas', 'valores'],
  };
  const a = arq.abas.find((x) => alvos[tipo].includes(chave(x.nome)));
  return (a ?? arq.abas[0])?.nome ?? '';
}

// ---------------- Mapeamento de colunas -------------------------------

const SINONIMOS: Record<string, string[]> = {
  data: ['data', 'dia', 'data de entrada', 'data entrada'],
  oficina: ['oficina', 'costureira', 'faccao'],
  modelo: ['modelo', 'peca', 'produto', 'referencia', 'nome'],
  tamanho: ['tamanho', 'tam', 'tam.'],
  quantidade: ['quantidade', 'qtd', 'qtde', 'qtd.', 'pecas', 'quant'],
  tipo: ['tipo', 'categoria'],
  operacao: ['operacao', 'servico', 'etapa'],
  valor_unitario: ['valor unitario', 'valor unit', 'valor unit.', 'preco unitario', 'preco', 'valor por peca'],
  valor: ['valor', 'valor pago', 'total', 'preco', 'valor por peca'],
  observacao: ['observacao', 'obs', 'obs.', 'situacao', 'descricao'],
  vigente_desde: ['vigente desde', 'vigencia', 'a partir de', 'data'],
  codigo: ['codigo', 'cod', 'cod.', 'ref'],
};

const CAMPOS: Record<TipoImport, string[]> = {
  entradas: ['data', 'oficina', 'modelo', 'tamanho', 'quantidade', 'tipo', 'operacao', 'valor_unitario', 'observacao'],
  pagamentos: ['data', 'oficina', 'valor', 'observacao'],
  precos: ['oficina', 'modelo', 'codigo', 'tipo', 'operacao', 'valor', 'vigente_desde'],
};

/** Descobre a linha de cabeçalho e o índice de cada campo. Sem cabeçalho, usa a ordem Modelo, Código, Valor (aba "Valor das peças"). */
export function mapear(linhas: unknown[][], tipo: TipoImport) {
  const campos = CAMPOS[tipo];
  for (let h = 0; h < Math.min(5, linhas.length); h++) {
    const cab = linhas[h].map((c) => chave(c));
    const idx: Record<string, number> = {};
    for (const campo of campos) {
      const i = cab.findIndex((c, j) => SINONIMOS[campo].includes(c) && !Object.values(idx).includes(j));
      if (i >= 0) idx[campo] = i;
    }
    const obrig = tipo === 'entradas' ? ['data', 'quantidade'] : tipo === 'pagamentos' ? ['data', 'valor'] : ['valor'];
    if (obrig.every((o) => o in idx)) return { cabecalho: h, idx, semCabecalho: false };
  }
  if (tipo === 'precos') return { cabecalho: -1, idx: { modelo: 0, codigo: 1, valor: 2 } as Record<string, number>, semCabecalho: true };
  return null;
}

// ---------------- Validação -------------------------------------------

export type Status = 'ok' | 'erro' | 'duplicada';
export interface LinhaValidada {
  n: number; status: Status; msg: string; resumo: string;
  dados: Record<string, unknown>;
  novaOficina?: string; novoModelo?: { nome: string; tipo: Tipo; codigo: string | null };
}

export interface Contexto {
  oficinas: Oficina[]; modelos: Modelo[]; precos: Preco[]; entradas: Entrada[]; pagamentos: Pagamento[];
}

export interface Opcoes {
  criarCadastros: boolean;   // cria oficinas/modelos que não existem
  usarValorPlanilha: boolean; // entradas: respeita o valor unitário do arquivo
  aplicarOficina: string;     // preços sem coluna oficina: '' = todas as ativas
  vigencia: string;           // preços sem coluna de vigência
  incluirDuplicadas: boolean;
}

const normModelo = (s: unknown) => chave(s).replace(/^conj\.?\s+/, 'conjunto ');
const tipoPorNome = (nome: string): Tipo => (/^conj/i.test(nome) ? 'Conjunto' : /^body/i.test(nome) ? 'Body' : 'Calcinha');
const tipoValido = (s: unknown): Tipo | null => TIPOS.find((t) => chave(t) === chave(s)) ?? null;

export function validar(tipo: TipoImport, linhas: unknown[][], mapa: NonNullable<ReturnType<typeof mapear>>, ctx: Contexto, op: Opcoes): LinhaValidada[] {
  const ofi = new Map(ctx.oficinas.map((o) => [chave(o.nome), o]));
  const mod = new Map(ctx.modelos.map((m) => [normModelo(m.nome), m]));
  const cel = (l: unknown[], campo: string) => (mapa.idx[campo] === undefined ? null : l[mapa.idx[campo]]);
  const out: LinhaValidada[] = [];

  const chavesExistentes = new Set(
    tipo === 'entradas'
      ? ctx.entradas.map((e) => [e.data, e.oficina_id, e.operacao, e.modelo_id ?? e.tipo, e.tamanho ?? '', e.quantidade].join('|'))
      : tipo === 'pagamentos' ? ctx.pagamentos.map((p) => [p.data, p.oficina_id, p.valor.toFixed(2)].join('|')) : [],
  );
  const vistasNoArquivo = new Set<string>();

  linhas.slice(mapa.cabecalho + 1).forEach((l, i) => {
    const n = i + mapa.cabecalho + 2; // número da linha como aparece no Excel
    const erros: string[] = [];
    const lv: LinhaValidada = { n, status: 'ok', msg: '', resumo: '', dados: {} };

    const resolverOficina = (bruto: unknown) => {
      const nome = String(bruto ?? '').trim();
      if (!nome) { erros.push('sem oficina'); return null; }
      const o = ofi.get(chave(nome));
      if (o) return o.id;
      if (op.criarCadastros) { lv.novaOficina = nome; return `nova:${chave(nome)}`; }
      erros.push(`oficina "${nome}" não cadastrada`); return null;
    };
    const resolverModelo = (bruto: unknown, tipoLinha: Tipo | null, codigo: string | null) => {
      const nome = String(bruto ?? '').trim();
      if (!nome) { erros.push('sem modelo'); return null; }
      const m = mod.get(normModelo(nome)) ?? (codigo ? ctx.modelos.find((x) => x.codigo === codigo) : undefined);
      if (m) return m;
      if (op.criarCadastros) {
        lv.novoModelo = { nome, tipo: tipoLinha ?? tipoPorNome(nome), codigo };
        return { id: `novo:${normModelo(nome)}`, nome, tipo: lv.novoModelo.tipo } as Modelo;
      }
      erros.push(`modelo "${nome}" não cadastrado`); return null;
    };

    if (tipo === 'entradas') {
      const data = parseData(cel(l, 'data'));
      if (!data) erros.push('data inválida');
      const oficina_id = resolverOficina(cel(l, 'oficina'));
      const qtd = parseNumero(cel(l, 'quantidade'));
      if (!qtd || qtd <= 0 || !Number.isInteger(qtd)) erros.push('quantidade inválida');
      const modeloBruto = cel(l, 'modelo'), tamBruto = cel(l, 'tamanho');
      const opCol = chave(cel(l, 'operacao'));
      const operacao: Operacao = opCol === 'corte' || chave(modeloBruto) === 'corte' || chave(tamBruto) === 'corte' ? 'Corte' : 'Costura';
      let tipoL = tipoValido(cel(l, 'tipo'));
      let modelo: Modelo | null = null;
      if (operacao === 'Costura') {
        modelo = resolverModelo(modeloBruto, tipoL, null);
        if (modelo) tipoL = modelo.tipo;
      } else if (!tipoL) erros.push('corte sem tipo (Calcinha, Conjunto ou Body)');
      const tamanho = operacao === 'Costura' && tamBruto != null && String(tamBruto).trim() ? String(tamBruto).trim().toUpperCase() : null;

      let vu = op.usarValorPlanilha ? parseNumero(cel(l, 'valor_unitario')) : null;
      if (vu === null && data && oficina_id && !oficina_id.startsWith('nova:') && (operacao === 'Corte' || (modelo && !modelo.id.startsWith('novo:')))) {
        vu = precoVigente(ctx.precos, { oficina_id, operacao, modelo_id: modelo?.id, tipo: tipoL, data })?.valor ?? null;
      }
      if (vu === null && !erros.length) erros.push('sem preço na tabela e sem valor unitário no arquivo');

      const obs = cel(l, 'observacao');
      lv.dados = { data, oficina_id, operacao, tipo: tipoL, modelo_id: modelo?.id ?? null, tamanho, quantidade: qtd, valor_unitario: vu, observacao: obs ? String(obs).trim() : null };
      lv.resumo = `${data ? data.split('-').reverse().join('/') : '?'}  ${String(cel(l, 'oficina') ?? '')}  ${operacao === 'Corte' ? `corte ${tipoL ?? ''}` : String(modeloBruto ?? '')} ${tamanho ?? ''}  ${qtd ?? '?'} pç${vu !== null ? `  R$ ${vu.toFixed(2).replace('.', ',')}` : ''}`;
      const k = [data, oficina_id, operacao, modelo?.id ?? tipoL, tamanho ?? '', qtd].join('|');
      if (!erros.length && chavesExistentes.has(k)) { lv.status = 'duplicada'; lv.msg = 'já existe no sistema'; }
      else if (!erros.length && vistasNoArquivo.has(k)) { lv.status = 'duplicada'; lv.msg = 'repetida no arquivo'; }
      vistasNoArquivo.add(k);
    }

    if (tipo === 'pagamentos') {
      const data = parseData(cel(l, 'data'));
      if (!data) erros.push('data inválida');
      const oficina_id = resolverOficina(cel(l, 'oficina'));
      const valor = parseNumero(cel(l, 'valor'));
      if (!valor) erros.push('valor inválido');
      const obs = cel(l, 'observacao');
      lv.dados = { data, oficina_id, valor: valor !== null ? Math.round(valor * 100) / 100 : null, observacao: obs ? String(obs).trim() : null };
      lv.resumo = `${data ? data.split('-').reverse().join('/') : '?'}  ${String(cel(l, 'oficina') ?? '')}  R$ ${valor?.toFixed(2).replace('.', ',') ?? '?'}${obs ? `  ${obs}` : ''}`;
      const k = [data, oficina_id, valor?.toFixed(2)].join('|');
      if (!erros.length && chavesExistentes.has(k)) { lv.status = 'duplicada'; lv.msg = 'já existe no sistema'; }
    }

    if (tipo === 'precos') {
      const valor = parseNumero(cel(l, 'valor'));
      if (valor === null || valor < 0) erros.push('valor inválido');
      const vig = parseData(cel(l, 'vigente_desde')) ?? op.vigencia;
      const temOficina = mapa.idx.oficina !== undefined;
      const oficinasAlvo: string[] = temOficina
        ? [resolverOficina(cel(l, 'oficina'))].filter((x): x is string => !!x)
        : op.aplicarOficina ? [op.aplicarOficina] : ctx.oficinas.filter((o) => o.ativa).map((o) => o.id);
      const modeloBruto = cel(l, 'modelo');
      const tipoL = tipoValido(cel(l, 'tipo'));
      const operacao: Operacao = chave(cel(l, 'operacao')) === 'corte' || (!modeloBruto && tipoL) ? 'Corte' : 'Costura';
      const codigo = cel(l, 'codigo') != null ? String(cel(l, 'codigo')).replace(/\.0+$/, '').trim() || null : null;
      let modelo: Modelo | null = null;
      if (operacao === 'Costura') modelo = resolverModelo(modeloBruto, tipoL, codigo);
      else if (!tipoL) erros.push('corte sem tipo');
      lv.dados = { oficinas: oficinasAlvo, operacao, modelo_id: modelo?.id ?? null, tipo: operacao === 'Corte' ? tipoL : null, valor, vigente_desde: vig };
      const nomesOf = temOficina ? String(cel(l, 'oficina') ?? '') : op.aplicarOficina ? ctx.oficinas.find((o) => o.id === op.aplicarOficina)?.nome : 'todas as oficinas';
      lv.resumo = `${operacao === 'Corte' ? `Corte ${tipoL ?? '?'}` : String(modeloBruto ?? '?')}  ${nomesOf}  R$ ${valor?.toFixed(2).replace('.', ',') ?? '?'}  desde ${vig.split('-').reverse().join('/')}`;
    }

    if (erros.length) { lv.status = 'erro'; lv.msg = erros.join('; '); }
    out.push(lv);
  });
  return out;
}

// ---------------- Gravação --------------------------------------------

async function inserirEmLotes(tabela: string, linhas: Record<string, unknown>[]) {
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await supabase.from(tabela).insert(linhas.slice(i, i + 500));
    if (error) throw new Error(`Linhas ${i + 1} a ${Math.min(i + 500, linhas.length)}: ${error.message}`);
  }
}

export async function gravar(tipo: TipoImport, validas: LinhaValidada[], ctx: Contexto) {
  // 1. cadastros novos
  const novasOf = Array.from(new Set(validas.map((v) => v.novaOficina).filter((x): x is string => !!x)));
  const idOf = new Map<string, string>();
  if (novasOf.length) {
    const { data, error } = await supabase.from('oficinas').insert(novasOf.map((nome) => ({ nome }))).select('id, nome');
    if (error) throw error;
    for (const o of data ?? []) idOf.set(`nova:${chave(o.nome)}`, o.id);
  }
  const novosMod = new Map<string, { nome: string; tipo: Tipo; codigo: string | null }>();
  for (const v of validas) if (v.novoModelo) novosMod.set(normModelo(v.novoModelo.nome), v.novoModelo);
  const idMod = new Map<string, string>();
  if (novosMod.size) {
    const { data, error } = await supabase.from('modelos').insert(Array.from(novosMod.values())).select('id, nome');
    if (error) throw error;
    for (const m of data ?? []) idMod.set(`novo:${normModelo(m.nome)}`, m.id);
  }
  const fixOf = (id: unknown) => (typeof id === 'string' && id.startsWith('nova:') ? idOf.get(id) ?? id : id);
  const fixMod = (id: unknown) => (typeof id === 'string' && id.startsWith('novo:') ? idMod.get(id) ?? id : id);

  // 2. registros
  if (tipo === 'entradas') {
    await inserirEmLotes('entradas', validas.map((v) => ({ ...v.dados, oficina_id: fixOf(v.dados.oficina_id), modelo_id: fixMod(v.dados.modelo_id) })));
    return validas.length;
  }
  if (tipo === 'pagamentos') {
    await inserirEmLotes('pagamentos', validas.map((v) => ({ ...v.dados, oficina_id: fixOf(v.dados.oficina_id) })));
    return validas.length;
  }
  // preços: atualiza o do mesmo dia de vigência, cria os demais
  const novos: Record<string, unknown>[] = [];
  let n = 0;
  for (const v of validas) {
    const d = v.dados as { oficinas: string[]; operacao: Operacao; modelo_id: string | null; tipo: Tipo | null; valor: number; vigente_desde: string };
    for (const ofRaw of d.oficinas) {
      const oficina_id = fixOf(ofRaw) as string, modelo_id = fixMod(d.modelo_id) as string | null;
      const existente = ctx.precos.find((p) => p.oficina_id === oficina_id && p.operacao === d.operacao && p.vigente_desde === d.vigente_desde &&
        (d.operacao === 'Costura' ? p.modelo_id === modelo_id : p.tipo === d.tipo));
      if (existente) {
        const { error } = await supabase.from('precos').update({ valor: d.valor }).eq('id', existente.id);
        if (error) throw error;
      } else novos.push({ oficina_id, operacao: d.operacao, modelo_id: d.operacao === 'Costura' ? modelo_id : null, tipo: d.operacao === 'Corte' ? d.tipo : null, valor: d.valor, vigente_desde: d.vigente_desde });
      n++;
    }
  }
  // o mesmo alvo repetido no arquivo: fica o último
  const unicos = new Map(novos.map((p) => [[p.oficina_id, p.operacao, p.modelo_id ?? p.tipo, p.vigente_desde].join('|'), p]));
  await inserirEmLotes('precos', Array.from(unicos.values()));
  return n;
}

// ---------------- Planilhas modelo ------------------------------------

export function baixarModelo(tipo: TipoImport) {
  const exemplos: Record<TipoImport, Record<string, unknown>[]> = {
    entradas: [
      { Data: '22/09/2026', Oficina: 'Marcelo', Modelo: 'Safira', Tamanho: 'P', Quantidade: 120, Tipo: 'Calcinha', 'Operação': 'Costura', 'Valor unitário': '', 'Observação': '' },
      { Data: '22/09/2026', Oficina: 'Marcelo', Modelo: 'Corte', Tamanho: 'Corte', Quantidade: 5000, Tipo: 'Calcinha', 'Operação': 'Corte', 'Valor unitário': '', 'Observação': '' },
    ],
    pagamentos: [{ Data: '22/09/2026', Oficina: 'Marcelo', Valor: 2500, 'Observação': 'Acerto' }],
    precos: [
      { Oficina: 'Marcelo', Modelo: 'Safira', 'Código': '1130', Tipo: 'Calcinha', 'Operação': 'Costura', Valor: 1.35, 'Vigente desde': '01/10/2026' },
      { Oficina: 'Antônio', Modelo: '', 'Código': '', Tipo: 'Calcinha', 'Operação': 'Corte', Valor: 0.15, 'Vigente desde': '01/10/2026' },
    ],
  };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exemplos[tipo]), tipo === 'precos' ? 'Preços' : tipo === 'entradas' ? 'Entradas' : 'Pagamentos');
  XLSX.writeFile(wb, `modelo-${tipo}.xlsx`);
}
