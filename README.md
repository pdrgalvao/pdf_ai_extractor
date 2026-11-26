# PDF AI Extractor

Aplicação web que lê o texto de um PDF, extrai os campos desejados com o Google Gemini e gera tabela, JSON e CSV.

## Jeito mais simples (sem instalar nada)

Use o link publicado pelo botão **Share** no Google AI Studio (com `GEMINI_API_KEY` configurada em **Settings > Secrets**). Assim funciona direto no navegador em qualquer computador.

## Rodar localmente em outro PC

Requer apenas [Node.js](https://nodejs.org/) (v22 ou superior):

1. Instale as dependências (apenas na primeira vez):

```bash
npm install
```

2. Crie o arquivo `.env` na raiz com sua chave gratuita do [Google AI Studio](https://aistudio.google.com/apikey):

```text
GEMINI_API_KEY=sua_chave_aqui
```

3. Inicie o aplicativo e abra `http://localhost:3000`:

```bash
npm run dev
```

## Campos

Um campo por linha (use `nome: descrição` se quiser orientar a IA):

```text
nome: nome completo da pessoa
cpf
data
valor: valor total em reais
```

Se o dado não estiver no texto, o campo volta como `null`. PDFs que são apenas imagem não têm texto selecionável (esta versão não faz OCR).
