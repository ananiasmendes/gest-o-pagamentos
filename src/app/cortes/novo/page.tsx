'use client';

import { useData } from '@/lib/data';
import { Cabecalho, Carregando } from '@/components/ui';
import CorteForm from '@/components/cortes/CorteForm';
import { AvisoMigracao } from '@/components/cortes/comum';

export default function NovoCortePage() {
  const { carregando, cortesProntos } = useData();
  if (carregando) return <Carregando />;
  return (
    <>
      <Cabecalho titulo="Novo corte" sub="Leia o risco, escolha a oficina de cada modelo e informe as folhas por cor." />
      {cortesProntos ? <CorteForm /> : <AvisoMigracao />}
    </>
  );
}
