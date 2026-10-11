import { asset } from '../lib/config';

export type Pose = 'ola' | 'vazio' | 'tudo-certo' | 'lembrete' | 'ops';

/** Boldinho, a folha de boldo que é a cara do app. Decorativo: o texto ao lado já diz tudo. */
export function Mascote({ pose, size = 160 }: { pose: Pose; size?: number }) {
  return (
    <img
      className="mascote"
      src={asset(`mascote/${pose}.webp`)}
      width={size}
      height={size}
      alt=""
      decoding="async"
    />
  );
}
