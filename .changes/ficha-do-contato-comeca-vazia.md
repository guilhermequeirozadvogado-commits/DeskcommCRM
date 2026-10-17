---
impacto: exige_acao
secao: alterado
titulo: A ficha do contato deixa de trazer campos prontos e passa a ser montada em Configurações › Fichas e campos
---

Até aqui, a organização que nunca publicou um layout em Configurações › Fichas e campos via uma ficha do contato fixa no código: o pré-atendimento jurídico de um escritório, com grupos como Atendimento, Contrato, Parcelas, Processo e Qualificação. Essa ficha saiu do código. Sem layout publicado, a ficha do contato agora aparece vazia: quem administra vê o atalho "Montar a ficha", e os demais veem a instrução para pedir a quem administra. "Começar a personalizar" passa a criar um rascunho em branco, em vez de copiar a ficha fixa.

Quando a leitura do desenho da ficha falha, a tela mostra "Tentar de novo" e nenhum campo, em vez de exibir uma ficha substituta que fazia parecer que o dado tinha sumido.

Nenhum valor é apagado: o que já foi preenchido continua em `contacts.custom_fields` e volta a aparecer assim que um campo com a mesma chave entra numa ficha publicada. Organizações que já publicaram um layout não veem diferença nenhuma. Nenhuma mudança de banco.

## Requer atenção

Se a sua organização usa a ficha do contato e nunca publicou um layout, faça isto **antes** de atualizar: abra Configurações › Fichas e campos, clique em "Começar a personalizar" (nesta versão, ele ainda copia a ficha atual para o rascunho) e depois em "Publicar". Depois da atualização, o botão passa a começar em branco, e a ficha antiga teria de ser remontada campo a campo.
