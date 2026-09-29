'use client';

import { useParams } from 'next/navigation';
import { useData } from '@/lib/data';
import { Cabecalho, Carregando, Vazio } from '@/components/ui';
import CorteForm from '@/components/cortes/CorteForm';
import { useCorte } from '@/components/cortes/comum';

export default function EditarCortePage() {
  const { id } = useParams<{ id: string }>();
  const { carregando } = useData();
  const det = useCorte(id);
  if (carregando) return <Carregando />;
  if (!det) return <Vazio titulo="Corte não encontrado" />;
  return (
    <>
      <Cabecalho titulo={`Editar ${det.corte.nome}`}
        sub={det.corte.status !== 'planejado' ? 'Este corte já foi cortado: ao salvar, o pagamento do corte é recalculado.' : undefined} />
      <CorteForm key={det.corte.id} existente={det} />
    </>
  );
}
