import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Mark } from '../components/Icon';
import { api } from '../lib/api';

export function Login() {
  const [password, setPassword] = useState('');
  const client = useQueryClient();
  const login = useMutation({
    mutationFn: api.login,
    onSuccess: (session) => client.setQueryData(['session'], session),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (password) login.mutate(password);
  };

  return (
    <div className="entrada">
      <div className="entrada-capa" aria-hidden="true">
        <svg className="entrada-folha" viewBox="0 0 400 400">
          <path d="M40 360C40 170 170 40 360 40c0 190-130 320-320 320Z" />
          <path d="M40 360 250 150M120 280V170M120 280h110M190 210v-75M190 210h75" />
        </svg>
      </div>

      <main className="entrada-form">
        <Mark size={56} />
        <h1>Boldo</h1>
        <p className="entrada-lema">
          A farmacinha de casa: o que tem, quanto resta e a hora de tomar.
        </p>

        <form onSubmit={onSubmit}>
          <div className="campo">
            <label htmlFor="senha">Senha</label>
            <input
              id="senha"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
              required
              aria-describedby={login.isError ? 'senha-erro' : undefined}
              aria-invalid={login.isError || undefined}
            />
          </div>
          {login.isError && (
            <p id="senha-erro" className="erro" role="alert">
              {login.error.message}
            </p>
          )}
          <button type="submit" className="botao" disabled={login.isPending || !password}>
            {login.isPending ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </main>
    </div>
  );
}
