# PDF AI Extractor

Aplicação web (Node.js + Express + React + Vite) que lê o texto de um PDF, pede ao Google Gemini os campos que você indicar e devolve o resultado em tabela, JSON e CSV.

A chave da API não fica no código nem é pedida na interface: configure a variável `GEMINI_API_KEY` no servidor (ou em **Settings > Secrets** no Google AI Studio).

O modelo padrão é `gemini-4-hydrogen`, com cota gratuita no Google AI Studio.

## Preparar

1. Crie uma chave gratuita em [Google AI Studio](https://aistudio.google.com/apikey) (ou configure em **Settings > Secrets**).
2. Instale as dependências e crie o arquivo `.env` a partir de `.env.example`:

```bash
npm install
cp .env.example .env
```

3. Preencha `GEMINI_API_KEY` no `.env` (ou nas variáveis de ambiente do servidor).

## Executar

Desenvolvimento (porta 3000):

```bash
npm run dev
```

Build e execução em produção:

```bash
npm run build
npm start
```

## Campos

Um campo por linha. A descrição depois dos dois-pontos orienta a IA:

```text
nome: nome completo da pessoa
cpf
data
valor: valor total em reais
```

Se o dado não estiver no texto, o campo volta vazio (`null` no JSON). PDFs que são apenas imagem não têm texto selecionável; esta versão não faz OCR.
