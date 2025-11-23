# Especificação Técnica: Controlador de Requisições Automatizadas

Este documento consolida as definições de entrada, configuração e estados da máquina de estados finitos (FSM) para o controlador de requisições.

## 1\. Definições de Entrada (Input)

O sistema aceita um objeto de missão contendo as seguintes diretrizes:

  * **Método de requisição:** `GET`, `POST`, `PUT`, `DELETE`.
  * **URL Alvo:** String formatada (ex: `https://api.exemplo.com/v1/resource?query=1`).
  * **Headers (Opcional):** Lista de pares chave-valor.
      * *Ex:* `Authorization: Bearer xyz`, `Content-Type: application/json`.
  * **Body (Opcional):** Payload da requisição.
      * *Nota:* Obrigatório ser string ou JSON stringified para métodos como `POST`/`PUT`.

## 2\. Configurações de Controle

Parâmetros que ditam o comportamento do agente durante a execução:

  * **Retry Policy (Repetição na falha):**
      * **Ativo:** Sim/Não.
      * **Max Retries:** Inteiro (Número máximo de tentativas antes de desistir).
  * **Logging (Gravar respostas):**
      * **Ativo:** Sim/Não (Define se o payload de resposta será persistido em storage/banco).
  * **Timeout:**
      * **Limite:** Segundos (Tempo máximo de espera por resposta antes de abortar a conexão).
  * **Throttling (Delay entre requisições):**
      * **Tempo:** Segundos (Tempo de espera antes de iniciar a requisição ou entre retentativas).

## 3\. Máquina de Estados (Fluxos Completos)

### 3.1. Estado Inicial: Abertura

1.  Inicialização do sistema.
2.  Carregamento de variáveis de ambiente.
3.  Alocação de memória para o Job.

### 3.2. Ciclo Base (Definição da Requisição)

Este ciclo constrói o objeto da requisição HTTP.

1.  **Definição de Método** $\rightarrow$ `GET` / `POST` / etc.
2.  **Definição da URL** $\rightarrow$ Validação de formato URL.
3.  **Gestão de Headers?**
      * **Se Sim:** Entra no [Ciclo Cadastro Header](https://www.google.com/search?q=%2333-ciclo-cadastro-header-sub-rotina).
      * **Se Não:** Avança.
4.  **Definição do Body** $\rightarrow$ Input de dados (se método permitir).
5.  **Revisão/Confirmação**
      * **Sim:** Vai para [Ciclo Configurações](https://www.google.com/search?q=%2334-ciclo-configura%C3%A7%C3%B5es-defini%C3%A7%C3%A3o-do-comportamento).
      * **Não:** Menu de edição (escolher passo numérico para editar) $\rightarrow$ Retorna à Revisão.

### 3.3. Ciclo Cadastro Header (Sub-rotina)

1.  **Input Key** (ex: `Content-Type`).
2.  **Input Value** (ex: `application/json`).
3.  **Preview do Item.**
4.  **Ação:**
      * *Adicionar mais:* Repete passo 1.
      * *Editar último:* Retorna ao passo 1 com dados pré-preenchidos.
      * *Concluir:* Retorna ao fluxo pai (Ciclo Base).

### 3.4. Ciclo Configurações (Definição do Comportamento)

Este ciclo define as regras de negócio da execução.

1.  **Configurar Retry?**
      * *Não:* `MaxRetries = 0`.
      * *Sim:* Input Quantidade.
2.  **Gravar Logs?**
      * *Sim/Não:* Define flag `SaveResponse`.
3.  **Configurar Timeout?**
      * *Não:* Define default (ex: 30s).
      * *Sim:* Input Segundos.
4.  **Configurar Delay?**
      * *Não:* `Delay = 0`.
      * *Sim:* Input Segundos.
5.  **Confirma Configurações?**
      * **Sim:** Transição para (ESTADO DE ESPERA / PRONTO).
      * **Não:** Volta ao início do Ciclo Configurações.

### 3.5. Ciclo de Execução (Runtime)

Este é o ciclo onde o software atua após ser configurado e inicializado.

  * **Estado: PREPARANDO**
    1.  Verifica conexão de internet.
    2.  Aplica Delay inicial (se configurado).
  * **Estado: DISPARANDO (Request)**
    1.  Monta pacote HTTP com (URL, Method, Headers, Body).
    2.  Dispara para o destino.
    3.  Inicia contador de Timeout.
  * **Estado: AGUARDANDO RESPOSTA**
      * **Evento A (Sucesso HTTP 2xx):** Vai para PROCESSAR SUCESSO.
      * **Evento B (Erro HTTP 4xx/5xx):** Vai para ANALISAR FALHA.
      * **Evento C (Timeout Estourado):** Aborta conexão $\rightarrow$ Vai para ANALISAR FALHA.

### 3.6. Ciclo de Resolução e Finalização

#### **PROCESSAR SUCESSO**

1.  Verifica flag `Gravar Respostas`.
2.  **Se Sim:** Salva payload no storage definido.
3.  Vai para FINALIZAÇÃO.

#### **ANALISAR FALHA**

1.  Incrementa contador de tentativas (`CurrentTry + 1`).
2.  Verifica: `CurrentTry <= MaxRetries`?
      * **Sim (Ainda pode tentar):**
        1.  Loga erro temporário.
        2.  Aplica Delay.
        3.  Retorna para **Estado: DISPARANDO**.
      * **Não (Esgotou tentativas):**
        1.  Loga erro fatal.
        2.  Vai para FINALIZAÇÃO.

#### **FINALIZAÇÃO**

1.  Gera relatório final da execução.
2.  Limpa memória.
3.  Encerra processo ou aguarda próxima instrução externa.