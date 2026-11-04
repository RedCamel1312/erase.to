# erase.to

Compartilhe textos e arquivos criptografados de forma temporária.

[English](README.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [简体中文](README.zh-CN.md) · [Português (Brasil)](README.pt-BR.md)

[Abrir erase.to](https://erase.to/) · [Documentação](docs/README.md) · [Modelo de segurança](docs/threat-model.md) · [Hospedagem própria](docs/operations.md)

## Sobre o projeto

erase.to é uma ferramenta de comunicação efêmera criada por RedCamel. Eu a desenvolvo, mantenho e opero como um projeto independente, de uma só pessoa. Seu objetivo é manter uma mensagem ou arquivo no serviço de entrega por um prazo curto, escolhido por quem envia.

Quero que compartilhar algo em particular seja simples: abrir o editor, escrever uma mensagem ou anexar arquivos, decidir quando o acesso deve acabar e enviar um link. Não é necessário criar uma conta, informar o endereço do destinatário ou manter uma lista de contatos. O destinatário precisa do link completo e, caso você a defina, de uma frase-senha adicional.

Privacidade não é um recurso pago. O serviço é gratuito, sem anúncios ou ferramentas de análise. Eu pago o servidor e o domínio do meu próprio bolso. Apoiar o projeto é opcional e não libera um nível diferente de proteção.

O conteúdo é criptografado no seu dispositivo antes do envio. O servidor mantém um pacote criptografado em memória volátil e aplica seu prazo de validade e limite de retiradas. A aplicação não mantém logs de acesso nem perfis de visitantes baseados em IP, e a interface não carrega scripts, fontes ou CDNs de terceiros. Essas escolhas reduzem as informações que o serviço precisa guardar durante uma entrega.

O armazenamento temporário tem consequências. Quando o pacote expira, é revogado, atinge o limite de retiradas ou desaparece após uma reinicialização do cache, não posso recuperá-lo para você. O destinatário ainda pode salvar o que recebe. O objetivo é limitar a cópia mantida pelo serviço e sua disponibilidade, sem prometer controle sobre o dispositivo de outra pessoa.

Publico o código e a documentação de operação para que você possa examinar essas escolhas, entender seus limites e executar sua própria instância. Quero que o projeto continue compreensível: uma ferramenta voltada à troca temporária, com o protocolo e as premissas de segurança documentados, em vez de escondidos atrás de afirmações genéricas sobre privacidade.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/editor-dark.jpg">
  <img src="docs/images/editor-light.jpg" alt="Editor de mensagens do erase.to no computador">
</picture>

<details>
<summary>Visualização no celular</summary>

<img src="docs/images/editor-mobile.jpg" alt="Editor do erase.to em um celular" width="390">

</details>

## Quando ele é útil

erase.to serve para uma troca em que o destinatário precisa de algo agora e o serviço de entrega não precisa guardá-lo indefinidamente. Por exemplo:

- Enviar um código de acesso temporário ou um detalhe de configuração com prazo curto.
- Entregar um documento para uma única retirada, sem criar uma pasta compartilhada ou uma conta para o destinatário.
- Reunir instruções e alguns arquivos para uma tarefa específica, com o mesmo prazo e limite de retiradas para todo o pacote.
- Enviar ou receber um pacote pelo terminal usando a CLI e o mesmo formato de criptografia do navegador.

Escolha um prazo e um número de retiradas adequados à troca. Um pacote com várias retiradas permitidas também expira; um pacote de uso único também precisa de prazo. Mantenha sob seu controle os originais de que precisará depois. erase.to não é um backup nem um repositório permanente de documentos.

## Da escrita ao recebimento

1. **Prepare o pacote.** Digite texto, adicione arquivos ou combine os dois. A interface mostra o tamanho total para você verificar o limite antes do envio.
2. **Escolha as condições.** Defina o prazo e o número de retiradas autorizadas. Adicione uma frase-senha se quiser que o destinatário precise de algo além do link.
3. **Crie e compartilhe.** Seu dispositivo criptografa o pacote antes de enviá-lo. Compartilhe o link gerado. A página de criação mantém um controle separado de revogação na sessão atual; ele não faz parte do link do destinatário. Mantenha essa sessão ativa se quiser remover antes a cópia do servidor. Limpar a sessão também remove esse controle local.
4. **Abra de forma explícita.** Acessar o link verifica a disponibilidade sem consumir uma retirada. O destinatário decide abrir o pacote. Uma frase-senha exigida é verificada localmente primeiro, para que um erro de digitação não destrua um pacote de uso único.
5. **Leia ou baixe.** O conteúdo é descriptografado no dispositivo do destinatário. Texto é exibido como texto; arquivos são oferecidos para download e não são abertos nem pré-visualizados automaticamente.

O link contém o segredo aleatório necessário para descriptografar. Trate o link completo como privado e envie a frase-senha adicional por outro canal quando depender dessa separação. A identidade do destinatário não é verificada: quem tiver o link e a frase exigidos terá o mesmo acesso que a pessoa pretendida.

O remetente pode revogar um pacote enquanto houver uma cópia no servidor. A revogação não desfaz uma entrega anterior. Da mesma forma, o contador descreve acessos ao servidor, sem comprovar que uma pessoa leu a mensagem; uma conexão interrompida pode consumir uma retirada antes que conteúdo utilizável chegue.

## Recursos

| Recurso | Comportamento |
| --- | --- |
| Texto e arquivos | Até **64 MiB no total**, incluindo até **8 MiB de texto UTF-8** e **8 arquivos**. Os nomes e tipos de mídia dos arquivos são criptografados. |
| Criptografia no cliente | XChaCha20-Poly1305, um segredo aleatório no link e uma frase-senha opcional com Argon2id. Uma frase incorreta não consome uma retirada. |
| Disponibilidade limitada | O prazo de validade e o número de retiradas valem ao mesmo tempo. A autorização, as alterações do contador e a exclusão final são atômicas entre processos de API que compartilham uma única instância primária do Valkey. |
| Controle do remetente | Uma credencial independente de revogação remove a cópia restante no servidor. Ela não faz parte do link do destinatário. |
| Limpeza local | Limpeza manual, prazo de cinco minutos de inatividade com aviso 30 segundos antes e limpeza do conteúdo descriptografado ao ocultar a aba. |
| Acesso e operação | Clientes para navegador e linha de comando, acesso onion opcional pelo Tor Browser e hospedagem própria com Rust, Svelte e Valkey sem persistência. |

## Privacidade durante uma sessão

O navegador mantém rascunhos, chaves e conteúdo descriptografado na sessão ativa, em vez de salvá-los como histórico de mensagens. Ele não restaura automaticamente um rascunho ou segredo depois que a página é recarregada. A página de recebimento remove o identificador e o segredo da URL atual após ler o fragmento; isso não remove cópias já guardadas por um aplicativo de mensagens, gerenciador da área de transferência ou extensão do navegador.

Você pode limpar a sessão local por conta própria. Após cinco minutos de inatividade, a página também limpa o estado sensível, com aviso 30 segundos antes. Ocultar uma aba que exibe conteúdo descriptografado limpa essa visualização. Essas ações afetam a página local: não mudam o prazo no servidor nem apagam arquivos baixados ou cópias na área de transferência.

A interface segue por padrão a preferência clara ou escura do seu sistema. Uma escolha explícita de tema pode ser salva localmente; mensagens, links e chaves não são armazenados ali de forma intencional. A troca não exige conta, cookie ou perfil de rastreamento.

Criar um pacote exige uma prova de trabalho vinculada ao conteúdo. Isso acrescenta um custo computacional aos envios sem criar um registro do visitante a partir do endereço IP. Também há limites globais de capacidade e frequência, então um serviço ocupado ou cheio pode rejeitar requisições. Esses controles não garantem disponibilidade contra toda forma de abuso.

## Experimente uma instância local

Com Git, Docker e Docker Compose instalados:

```sh
git clone https://github.com/RedCamel1312/erase.to.git
cd erase.to
docker compose up --build -d
```

Abra `http://127.0.0.1:3001`. O Compose publica a porta apenas nesse endereço de loopback; a aplicação e o cache usam redes internas. Parar o cache descarta os pacotes armazenados nele.

Para hospedagem pública, siga o [guia de operação](docs/operations.md), que inclui HTTPS ou um contexto de navegador compatível com serviços onion, controles de swap e despejos de memória, buffers do proxy e verificação do host. Contêineres, por si só, não garantem operação exclusivamente em RAM. Para trabalhar no código, consulte o [guia de desenvolvimento](docs/development.md). A documentação técnica detalhada está em inglês.

## Limites que vale conhecer

Quero que as limitações sejam tão visíveis quanto os recursos. A adequação de uma entrega depende do seu dispositivo, de quem a recebe e do canal usado para compartilhar o acesso.

- Um link completo concede acesso, a menos que uma frase-senha adicional seja exigida. Proteja o link e compartilhe a frase separadamente quando essa separação for importante.
- O contador limita retiradas autorizadas, não pessoas nem entregas concluídas. A última retirada, se interrompida, ainda pode consumir o pacote. Destinatários podem guardar cópias; a revogação e a limpeza local não as removem.
- Reiniciar o cache descarta os pacotes. Transferências grandes mantêm pacotes completos em memória, podem exigir várias vezes o tamanho do conteúdo em RAM e precisam terminar dentro dos prazos definidos.
- A criptografia não esconde todos os metadados nem protege um dispositivo comprometido. O servidor vê parâmetros de acesso e informações de transporte; o navegador também precisa confiar no código recebido. Revisão de código e testes não equivalem a uma auditoria independente de segurança nem garantem anonimato.

O [modelo de ameaças](docs/threat-model.md) explica esses limites em detalhes.

<details>
<summary>Como o protocolo e o armazenamento funcionam</summary>

### Criptografia e acesso

![Fluxo de dados e limites de confiança](docs/images/architecture.svg)

O worker do navegador e a CLI compartilham o protocolo versionado em `shared/`. A criptografia XChaCha20-Poly1305 usa um segredo aleatório de 256 bits no link e um nonce de 192 bits. As frases-senha opcionais usam Argon2id v1.3 com 64 MiB de memória e três passagens. Metadados autenticados vinculam as regras do pacote ao conteúdo; o preenchimento em blocos de 4 KiB oculta comprimentos exatos, mas o tamanho aproximado continua visível.

O segredo do link permanece no fragmento da URL, que os navegadores não enviam nas requisições HTTP. Consulta de metadados, retirada e revogação usam credenciais separadas. O servidor recebe dados criptografados, campos públicos do protocolo, regras de acesso, hashes das credenciais e a credencial apresentada em cada acesso; no protocolo normal, ele não recebe o conteúdo em texto claro, os nomes originais dos arquivos, o segredo do link, a frase-senha ou a chave de descriptografia.

### Armazenamento e consumo

A API Rust valida requisições com limites definidos e provas de trabalho de uso único vinculadas ao pacote. Scripts fixos do Valkey coordenam expiração, consumo, revogação e capacidade. Todo pacote expira, a persistência e a remoção automática por falta de espaço estão desativadas, e novos envios são recusados quando a capacidade se esgota. Reiniciar apenas a API pode preservar os pacotes enquanto o cache continua em execução.

O uso único é coordenado no cache que mantém o estado autoritativo, e não por uma trava dentro de um único processo de API. Autorização, validade, alterações do contador e exclusão formam uma transição atômica. Essa propriedade pressupõe uma única instância primária do Valkey; acrescentar failover assíncrono ou restaurar dados antigos do cache exige um projeto de consistência separado.

O servidor limita tamanhos de requisição, trabalho simultâneo e tempo de execução, e não repete automaticamente uma operação de consumo cujo resultado seja incerto. Os controles de swap, despejos, persistência e buffers do proxy são tão importantes quanto escolher um armazenamento em memória.

Veja a [especificação do protocolo](docs/protocol.md) e as [fontes do projeto](docs/research.md) para os formatos exatos e suas justificativas.

</details>

<details>
<summary>Desenvolvimento, linha de comando e verificação</summary>

Use Node 24 e a versão do pnpm fixada em `package.json`:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm cli help
```

O [guia de desenvolvimento](docs/development.md) aborda Rust, uma instância isolada do Valkey e o servidor de desenvolvimento do navegador. O [guia de testes](docs/testing.md) descreve verificações com cache real, vários processos e fluxos completos. Os testes nunca devem usar um cache de produção.

O [guia da CLI](docs/cli.md) explica envio, recebimento, entrada de frases-senha e revogação. Não coloque links completos, mensagens ou frases-senha em argumentos ou no histórico do shell. A CLI aceita HTTPS e HTTP local para desenvolvimento; ela rejeita endereços onion porque não implementa transporte Tor. Use o Tor Browser para acesso onion. Arquivos recebidos nunca são abertos nem pré-visualizados automaticamente.

Os principais diretórios são `web/` (interface), `shared/` (protocolo e criptografia), `server/` (API e operações atômicas do cache), `cli/` e `deploy/`. A CI verifica a aplicação, o comportamento com cache real e o contêiner de produção. O [índice da documentação](docs/README.md) reúne a navegação completa.

</details>

## Manutenção do projeto

Mantenho tanto a aplicação quanto a documentação. Publicar o código permite que outras pessoas examinem como as afirmações são implementadas, proponham melhorias ou executem uma instância sob seu próprio controle. Por si só, isso não comprova quais arquivos de programa um serviço hospedado executa nem transforma uma suíte de testes em auditoria independente.

Contribuições úteis incluem relatos claros de erros, revisão do protocolo e das premissas de implantação, melhorias de acessibilidade e correções destas traduções. Um relato com um exemplo fictício e reproduzível me ajuda a investigar sem coletar seu conteúdo privado. Os documentos técnicos continuam em inglês; as cinco introduções descrevem os mesmos recursos e limites.

## Contribua ou relate um problema

O [guia de contribuição](CONTRIBUTING.md) aborda desenvolvimento e revisão. Relate vulnerabilidades de forma privada, conforme a [política de segurança](SECURITY.md). Use exemplos fictícios; não publique links privados, mensagens ou credenciais de acesso em issues.

## Apoie o projeto

Eu pago o servidor e o domínio do meu próprio bolso. Se esta ferramenta é útil para você e quiser apoiar meu trabalho e os custos de operação, pode contribuir com alguns sats. O serviço continua gratuito.

Bitcoin (BTC):

```text
bc1qddfz8u589nvh0gcxdqcz3yltracn9t9qq9jtm7
```

Criado por RedCamel. Licenciado sob a [MIT](LICENSE). [Avisos de terceiros](THIRD_PARTY.md).
