# MiroFish Roulette Lab

Laboratorio web para testar estrategias de roleta europeia com uma populacao de agentes.

O app nao promete prever roleta justa. Ele registra historico, usa dados iniciais de graficos da mesa, combina agentes estatisticos e mede se a recomendacao esta performando melhor que um controle aleatorio.

## Recursos

- Entrada manual de resultados da roleta.
- Seed inicial a partir de dados de print: cores, paridade, faixas, duzias, colunas e ultimos numeros.
- Populacao de agentes: quentes, atrasados, setor fisico, Markov, ritmo, tiny learner, seed do print e cetico.
- Recomendacao de numero central + vizinhos no volante europeu.
- Paper test de 10 rodadas antes de apostar dinheiro real.
- Backtest do historico com ROI, skips, acertos, cobertura media e controle aleatorio.

## Rodar localmente

```bash
npm install
npm run dev
```

## Build

```bash
npm run lint
npm run build
```

## Fluxo sugerido

1. Abra a aba `Seed`.
2. Cole os dados do print da mesa ou use `Print exemplo`.
3. Clique em `Iniciar com o print`.
4. Rode 10 rodadas em modo paper, apenas digitando o numero que saiu.
5. So considere apostar se o sistema estiver melhor que o controle aleatorio em uma amostra maior.
