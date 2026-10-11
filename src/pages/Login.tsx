import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Mark } from '../components/Icon';
import { Mascote } from '../components/Mascote';
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
        <Mascote pose="ola" size={420} />
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
