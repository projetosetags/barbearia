(() => {
  const cfg = window.BARBEARIA_CONFIG || {};
  const fb = window.FB_CONFIG || {};
  const $ = id => document.getElementById(id);

  if (!window.firebase || !fb.apiKey || !fb.projectId) {
    console.error('Firebase não configurado.');
    return;
  }

  if (!firebase.apps.length) firebase.initializeApp(fb);
  const db = firebase.firestore();
  const auth = firebase.auth();
let usuarioAtual = null;

async function garantirUsuario(){
  if(auth.currentUser){
    usuarioAtual = auth.currentUser;
    return usuarioAtual;
  }

  const credencial = await auth.signInAnonymously();
  usuarioAtual = credencial.user;

  return usuarioAtual;
}
  let servicos = [];
  let barbeiros = [];
  let planoSelecionado = null;
  let pararDeOuvirOcupacoes = null;

  const hoje = () => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const moeda = v => Number(v || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const telefoneLimpo = v => String(v || '').replace(/\D/g,'').replace(/^55(?=\d{10,11}$)/,'');
  const formatarTelefone = v => {const n=telefoneLimpo(v).slice(0,11);if(n.length<=2)return n;if(n.length<=7)return `(${n.slice(0,2)}) ${n.slice(2,3)} ${n.slice(3)}`;return `(${n.slice(0,2)}) ${n.slice(2,3)} ${n.slice(3,7)} ${n.slice(7)}`};
  const minutos = h => {const [hh,mm]=String(h).split(':').map(Number);return hh*60+mm};
  const horaTexto = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
  const diaSemana = data => {const [ano,mes,dia]=String(data).split('-').map(Number);return new Date(ano,mes-1,dia,12,0,0).getDay()};
  const idReserva = (data,barbeiro,hora) => `${data}_${String(barbeiro||'barbeiro').replace(/[^a-zA-Z0-9_-]/g,'-')}_${String(hora||'').slice(0,5).replace(':','-')}`;

  function mostrarMensagem(texto,tipo='ok'){const el=$('mensagem');if(!el)return;el.textContent=texto;el.className=`mensagem ${tipo}`}

  async function carregarConfiguracoes(){
    try{
      const ref=await db.collection('configuracoes').doc('geral').get();
      if(!ref.exists)return;
      const d=ref.data();
      if(d.nome)cfg.nome=d.nome;if(d.cidade)cfg.cidade=d.cidade;if(d.endereco)cfg.endereco=d.endereco;if(d.whatsapp)cfg.whatsapp=d.whatsapp;if(d.intervalo)cfg.intervalo=Number(d.intervalo);
    }catch(e){console.warn('Não foi possível carregar configurações',e)}
  }

  function carregarServicos(){
    servicos=(cfg.servicosPadrao||[]).map(item=>({id:item.id,nome:item.nome,duracao_minutos:Number(item.duracao||30),valor:Number(item.valor||0)}));
    const select=$('servicoSelect');
    if(select){select.innerHTML='<option value="">Escolha um serviço</option>'+servicos.map(item=>`<option value="${item.id}">${item.nome}</option>`).join('')}
  }

  async function carregarBarbeiros(){
    try{
      const snap=await db.collection('barbeiros').where('ativo','==',true).get();
      barbeiros=snap.docs.map(doc=>({id:doc.id,...doc.data()})).sort((a,b)=>Number(a.ordem||0)-Number(b.ordem||0));
    }catch(e){console.warn('Não foi possível carregar barbeiros do Firebase',e);barbeiros=[]}
    if(!barbeiros.length)barbeiros=cfg.barbeirosPadrao||[];
    const select=$('barbeiroSelect');
    if(select){select.innerHTML=barbeiros.map(item=>`<option value="${item.id}">${item.nome}</option>`).join('');if(barbeiros[0])select.value=barbeiros[0].id}
  }

  function servicoAtual(){return servicos.find(x=>String(x.id)===String($('servicoSelect')?.value))}

  function referenciasOcupacoesPossivelmenteConflitantes(data,barbeiro,inicio,duracao){
    const maiorDuracao=Math.max(30,...servicos.map(s=>Number(s.duracao_minutos||30)));
    const primeiro=Math.max(0,Math.floor((inicio-maiorDuracao)/30)*30);
    const limite=inicio+duracao;
    const refs=[];
    for(let m=primeiro;m<limite;m+=30){
      refs.push(db.collection('ocupacoes').doc(idReserva(data,barbeiro,horaTexto(m))));
    }
    return refs;
  }
  function ocupacaoConflita(snapshot,inicio,duracao,ignorarId=null){
    if(!snapshot?.exists||snapshot.id===ignorarId)return false;
    const ocupacao=snapshot.data()||{};
    const inicioOcupado=minutos(String(ocupacao.hora||'').slice(0,5));
    const duracaoOcupada=Number(ocupacao.duracao_minutos||30);
    return inicio<inicioOcupado+duracaoOcupada&&inicio+duracao>inicioOcupado;
  }

  async function selecionarServico(id,rolar=true){
    const s=servicos.find(x=>String(x.id)===String(id));
    if(!s)return;
    $('servicoSelect').value=s.id;
    document.querySelectorAll('.service-card').forEach(card=>card.classList.toggle('selected',card.dataset.service===s.id));
    const escolhido=$('servicoEscolhido');
    if(escolhido)escolhido.textContent=`${s.nome} • ${s.duracao_minutos} min • ${moeda(s.valor)}`;
    mostrarMensagem('','ok');
    await gerarHorarios();
    if(rolar){setTimeout(()=>$('agendar')?.scrollIntoView({behavior:'smooth',block:'start'}),120)}
  }

  function servicoDoPlano(planoId){
    return ({'mensal-cabelo':'corte','mensal-cabelo-barba':'cabelo-barba','mensal-cabelo-barba-sobrancelha':'combo'})[planoId]||null;
  }

  function ativarCards(){
    document.querySelectorAll('.service-card[data-service]').forEach(card=>card.addEventListener('click',()=>{
      const esperado=planoSelecionado?servicoDoPlano(planoSelecionado.id):null;
      if(planoSelecionado && card.dataset.service!==esperado) planoSelecionado=null;
      selecionarServico(card.dataset.service,true).then(()=>{
        if(planoSelecionado){const el=$('servicoEscolhido');if(el)el.textContent=servicoAtual().nome+' • Plano mensal '+planoSelecionado.nome+' • '+moeda(planoSelecionado.valor)+'/mês';}
      });
    }));
    document.querySelectorAll('[data-plano-mensal]').forEach(button=>button.addEventListener('click',()=>{
      const plano=(cfg.planosMensais||[]).find(p=>p.id===button.dataset.planoMensal);if(!plano)return;
      planoSelecionado=plano;
      const id=servicoDoPlano(plano.id);if(!id)return;
      const card=document.querySelector('.service-card[data-service="'+id+'"]');if(card)card.click();
      setTimeout(()=>{
        const el=$('servicoEscolhido');if(el)el.textContent=servicoAtual().nome+' • Plano mensal '+plano.nome+' • '+moeda(plano.valor)+'/mês';
        mostrarMensagem('Plano escolhido. Preencha seus dados e selecione data e horário para agendar pelo sistema.','ok');
        $('agendar')?.scrollIntoView({behavior:'smooth',block:'start'});
      },180);
    }));
    $('btnEscolherPlano')?.addEventListener('click',()=>document.getElementById('planosMensais')?.scrollIntoView({behavior:'smooth',block:'center'}));
  }

  async function carregarCatalogo(){try{carregarServicos();await carregarBarbeiros();ativarCards()}catch(e){console.error(e);mostrarMensagem('Não foi possível carregar os dados da barbearia agora.','erro')}}

  async function agendamentosOcupados(){
    const data=$('dataAgendamento')?.value,barbeiro=$('barbeiroSelect')?.value;
    if(!data||!barbeiro)return [];
    try{
      // A coleção ocupacoes é pública e não contém dados pessoais.
      // Ela é a fonte correta para esconder horários de TODOS os clientes.
      const snap=await db.collection('ocupacoes').where('data','==',data).where('barbeiro_id','==',barbeiro).get();
      return snap.docs.map(doc=>doc.data())
        .map(item=>({inicio:minutos(String(item.hora||'').slice(0,5)),duracao:Number(item.duracao_minutos||30)}))
        .filter(item=>Number.isFinite(item.inicio));
    }catch(e){console.warn('Consulta pública de ocupações indisponível',e);return []}
  }

  async function gerarHorarios(){
    const select=$('horaSolicitada');if(!select)return;
    const data=$('dataAgendamento')?.value;if(!data){select.innerHTML='<option value="">Escolha uma data</option>';return}
    let agendaDia=cfg.horariosSemana?.[diaSemana(data)];
    try{const esp=await db.collection('horarios_especiais').doc(data).get();if(esp.exists){const x=esp.data()||{};if(x.ativo===true&&x.fechado===true)agendaDia=null;else if(x.ativo===true&&/^\\d{2}:\\d{2}$/.test(x.inicio||'')&&/^\\d{2}:\\d{2}$/.test(x.fim||'')&&minutos(x.fim)>minutos(x.inicio))agendaDia={inicio:x.inicio,fim:x.fim}}}catch(e){console.warn('Horário especial indisponível',e)}
    if(!agendaDia){select.innerHTML='<option value="">Fechado neste dia</option>';return}
    const ocupados=await agendamentosOcupados();
    let bloqueios=[...(cfg.bloqueiosPadrao?.[diaSemana(data)]||[])];try{const bs=await db.collection('bloqueios').where('data','==',data).get();bloqueios.push(...bs.docs.map(d=>d.data()).filter(x=>!x.barbeiro_id||x.barbeiro_id===$('barbeiroSelect')?.value))}catch(e){console.warn('Bloqueios indisponíveis',e)}
    try{const lib=await db.collection('liberacoes').doc(data).get();if(lib.exists){const ls=lib.data().periodos||[];bloqueios=bloqueios.filter(b=>!ls.some(l=>minutos(l.inicio)<=minutos(b.inicio)&&minutos(l.fim)>=minutos(b.fim)))}}catch(e){console.warn('Liberações indisponíveis',e)}
    const inicio=minutos(agendaDia.inicio),fim=minutos(agendaDia.fim),intervalo=Number(cfg.intervalo||30),duracao=Number(servicoAtual()?.duracao_minutos||30),agora=new Date(),horarios=[];
    for(let m=inicio;m+duracao<=fim;m+=intervalo){
      const h=horaTexto(m);
      const conflita=ocupados.some(o=>m<o.inicio+o.duracao && m+duracao>o.inicio);
      const bloqueado=bloqueios.some(b=>m<minutos(b.fim) && m+duracao>minutos(b.inicio));
      if(conflita||bloqueado)continue;
      if(data===hoje()){
        const alvo=new Date();alvo.setHours(Math.floor(m/60),m%60,0,0);
        if(alvo.getTime()<agora.getTime()+20*60000)continue;
      }
      horarios.push(h);
    }
    select.innerHTML=horarios.length?horarios.map(h=>`<option value="${h}">${h}</option>`).join(''):'<option value="">Sem horários disponíveis</option>';
  }

  function mensagemWhatsApp(d){
    const s=servicos.find(x=>String(x.id)===String(d.servico));const b=barbeiros.find(x=>String(x.id)===String(d.barbeiro));
    return [`Olá! Meu agendamento na ${cfg.nome} foi registrado.`,``,`Cliente: ${d.nome}`,`WhatsApp: ${d.telefone}`,`Serviço: ${s?.nome||d.servico}`,d.plano?`Plano mensal: ${d.plano.nome} • Visita ${String(d.planoVisita||1).padStart(2,'0')} • ${moeda(Number(d.planoVisita||1)===1?d.plano.valor:0)} neste atendimento`:'',`Barbeiro: ${b?.nome||d.barbeiro}`,`Data: ${d.data.split('-').reverse().join('/')}`,`Horário: ${d.hora}`,d.obs?`Observação: ${d.obs}`:'',``,`Horário reservado automaticamente pelo sistema.`].filter(Boolean).join('\\n');
  }
  function mostrarConfirmacaoAgendamento(d){
    const modal=$('modalAgendamentoConfirmado'),resumo=$('resumoAgendamentoConfirmado'),link=$('btnEnviarWhatsAppConfirmacao');
    const s=servicos.find(x=>String(x.id)===String(d.servico)),b=barbeiros.find(x=>String(x.id)===String(d.barbeiro));
    const dataFormatada=d.data.split('-').reverse().join('/');
    const detalhes=dataFormatada+' às '+d.hora+' • '+(s?.nome||d.servico)+' • '+(b?.nome||'Leandro');
    if(resumo)resumo.textContent=d.plano?detalhes+' • '+d.plano.nome+' • Visita '+String(d.planoVisita||1).padStart(2,'0')+' • '+moeda(Number(d.planoVisita||1)===1?d.plano.valor:0)+' neste atendimento':detalhes;
    if(link){const numero=String(cfg.whatsapp||'').replace(/\\D/g,'');link.href=numero?'https://wa.me/'+numero+'?text='+encodeURIComponent(mensagemWhatsApp(d)):'#';link.hidden=!numero;}
    modal?.classList.remove('hidden');
  }
  function fecharConfirmacaoAgendamento(){
    $('modalAgendamentoConfirmado')?.classList.add('hidden');
  }

async function buscarAgendamentoDoCliente(data, telefone){
  await garantirUsuario();

  const snap = await db
    .collection('agendamentos')
    .where('owner_uid','==',usuarioAtual.uid)
    .where('data','==',data)
    .get();

  const ativos = snap.docs
    .map(doc => ({id:doc.id,...doc.data()}))
    .filter(item =>
      !['cancelado','finalizado'].includes(
        String(item.status || '').toLowerCase()
      )
    );

  if(!ativos.length) return null;

  ativos.sort((a,b)=>
    String(a.hora || '').localeCompare(
      String(b.hora || '')
    )
  );

  return ativos[0];
}

function aindaPodeAlterar(agendamento){
  if(!agendamento?.data || !agendamento?.hora) return false;

  const [ano,mes,dia] = agendamento.data.split('-').map(Number);
  const [hh,mm] = String(agendamento.hora).slice(0,5).split(':').map(Number);

  const horario = new Date(
    ano,
    mes - 1,
    dia,
    hh,
    mm,
    0,
    0
  );

  return horario.getTime() > Date.now();
}

async function horarioOcupadoPorOutro(
  data,
  barbeiro,
  hora,
  ignorarId = null
){
  await garantirUsuario();

  const novoInicio = minutos(hora);
  const novaDuracao =
    Number(servicoAtual()?.duracao_minutos || 30);

  try{
    const snap = await db
      .collection('ocupacoes')
      .where('data','==',data)
      .where('barbeiro_id','==',barbeiro)
      .get();

    return snap.docs.some(doc=>{
      const item = doc.data();

      if(
        ignorarId &&
        item.agendamento_id === ignorarId
      ){
        return false;
      }

      const inicio = minutos(
        String(item.hora || '').slice(0,5)
      );

      const duracao =
        Number(item.duracao_minutos || 30);

      return (
        novoInicio < inicio + duracao &&
        novoInicio + novaDuracao > inicio
      );
    });

  }catch(err){
    console.error(
      'Erro ao consultar disponibilidade:',
      err
    );

    throw err;
  }
}

async function registrarCliente(d){
  try{
    await garantirUsuario();
    const telefone=telefoneLimpo(d.telefone);
    if(!telefone)return;
    await db.collection('clientes').doc('tel_'+telefone).set({
      nome:d.nome,
      telefone,
      owner_uid:usuarioAtual.uid,
      atualizado_em:firebase.firestore.FieldValue.serverTimestamp(),
      criado_por:'cliente'
    },{merge:true});
  }catch(e){
    console.warn('Cadastro do cliente não atualizado:',e);
  }
}

async function proximaVisitaMensalCliente(d){
  if(!d.plano)return 0;
  await garantirUsuario();
  const mes=String(d.data||'').slice(0,7),inicio=mes+'-01',fim=mes+'-31';
  const snap=await db.collection('agendamentos').where('owner_uid','==',usuarioAtual.uid).where('data','>=',inicio).where('data','<=',fim).get();
  const tel=telefoneLimpo(d.telefone);
  const anteriores=snap.docs.map(doc=>doc.data()).filter(x=>telefoneLimpo(x.telefone)===tel&&String(x.status||'').toLowerCase()!=='cancelado'&&String(x.servico_nome||'').includes(d.plano.nome));
  const numeros=anteriores.map(x=>{const m=String(x.servico_nome||'').match(/visita\s*0*(\d+)/i);return m?Number(m[1])||0:0});
  return Math.max(anteriores.length,...numeros,0)+1;
}
async function salvarNovoAgendamento(d){
  await garantirUsuario();

  const s = servicos.find(
    x => String(x.id) === String(d.servico)
  );

  const duracao = Number(s?.duracao_minutos || 30);
  const inicio = minutos(d.hora);
  const agendamentoId =
    idReserva(d.data,d.barbeiro,d.hora);

  const refAgendamento = db
    .collection('agendamentos')
    .doc(agendamentoId);

  const refOcupacao = db
    .collection('ocupacoes')
    .doc(agendamentoId);

  const refsConflito=referenciasOcupacoesPossivelmenteConflitantes(
    d.data,d.barbeiro,inicio,duracao
  );

  await db.runTransaction(async transaction => {
    const leituras=await Promise.all([
      transaction.get(refAgendamento),
      transaction.get(refOcupacao),
      ...refsConflito.map(ref=>transaction.get(ref))
    ]);
    const [agendamentoExato,ocupacaoExata]=leituras;
    const ocupacoesPossiveis=leituras.slice(2);

    if(agendamentoExato.exists||ocupacaoExata.exists){
      throw new Error('HORARIO_OCUPADO');
    }

    if(ocupacoesPossiveis.some(snapshot=>ocupacaoConflita(snapshot,inicio,duracao))){
      throw new Error('HORARIO_OCUPADO');
    }

    const criadoEm =
      firebase.firestore.FieldValue.serverTimestamp();

    transaction.set(refAgendamento,{
      nome:d.nome,
      telefone:telefoneLimpo(d.telefone),
      servico_id:d.servico,
      servico_nome:d.plano?`${s?.nome||d.servico} — ${d.plano.nome} (${moeda(d.plano.valor)}/mês) • Visita ${String(d.planoVisita||1).padStart(2,'0')}`:s?.nome || d.servico,
      duracao_minutos:duracao,
      barbeiro_id:d.barbeiro,
      data:d.data,
      hora:d.hora,
      hora_solicitada:d.hora,
      observacao:[d.obs,d.plano?`Plano mensal selecionado: ${d.plano.nome} (${moeda(d.plano.valor)}/mês) • Visita ${String(d.planoVisita||1).padStart(2,'0')}`:'' ].filter(Boolean).join(' | '),
      status:'pendente',
      criado_em:criadoEm,
      atualizado_em:criadoEm,
      valor:d.plano?(Number(d.planoVisita||1)===1?Number(d.plano.valor):0):Number(s?.valor||0),
      owner_uid:usuarioAtual.uid
    });

    transaction.set(refOcupacao,{
      agendamento_id:agendamentoId,
      data:d.data,
      hora:d.hora,
      barbeiro_id:d.barbeiro,
      duracao_minutos:duracao,
      owner_uid:usuarioAtual.uid,
      criado_em:criadoEm
    });
  });
}
async function alterarAgendamento(antigo,d){
  await garantirUsuario();
  const s=servicos.find(x=>String(x.id)===String(d.servico));
  const novoId=idReserva(d.data,d.barbeiro,d.hora);
  const refAntigo=db.collection('agendamentos').doc(antigo.id),refOcupacaoAntiga=db.collection('ocupacoes').doc(antigo.id);
  const refNovo=db.collection('agendamentos').doc(novoId),refOcupacaoNova=db.collection('ocupacoes').doc(novoId);
  const duracao=Number(s?.duracao_minutos||30),inicio=minutos(d.hora);
  const refsConflito=referenciasOcupacoesPossivelmenteConflitantes(d.data,d.barbeiro,inicio,duracao);
  const planoAtual=d.plano||(cfg.planosMensais||[]).find(p=>String(antigo.servico_nome||'').includes(p.nome))||null;
  const visitaAtualTexto=(String(antigo.servico_nome||'').match(/visita\s*0*(\d+)/i)||[])[1]||'01';
  const visitaAtual=Math.max(1,Number(visitaAtualTexto)||1),visitaTexto=String(visitaAtual).padStart(2,'0');
  const nomeServico=planoAtual?`${s?.nome||d.servico} — ${planoAtual.nome} (${moeda(planoAtual.valor)}/mês) • Visita ${visitaTexto}`:s?.nome||d.servico;
  const observacao=[d.obs,planoAtual?`Plano mensal selecionado: ${planoAtual.nome} (${moeda(planoAtual.valor)}/mês) • Visita ${visitaTexto}`:'' ].filter(Boolean).join(' | ');
  await db.runTransaction(async transaction=>{
    const leituras=await Promise.all([
      transaction.get(refAntigo),
      transaction.get(refOcupacaoNova),
      ...refsConflito.map(ref=>transaction.get(ref))
    ]);
    const [agendamentoAntigo,ocupacaoNova]=leituras;
    const ocupacoesPossiveis=leituras.slice(2);
    if(!agendamentoAntigo.exists)throw new Error('AGENDAMENTO_NAO_ENCONTRADO');
    if(novoId!==antigo.id&&ocupacaoNova.exists)throw new Error('HORARIO_OCUPADO');
    const conflito=ocupacoesPossiveis.some(snapshot=>ocupacaoConflita(snapshot,inicio,duracao,antigo.id));
    if(conflito)throw new Error('HORARIO_OCUPADO');
    const timestamp=firebase.firestore.FieldValue.serverTimestamp();
    const dados={nome:d.nome,telefone:telefoneLimpo(d.telefone),servico_id:d.servico,servico_nome:nomeServico,duracao_minutos:duracao,barbeiro_id:d.barbeiro,data:d.data,hora:d.hora,hora_solicitada:d.hora,observacao,status:'pendente',atualizado_em:timestamp,valor:planoAtual?(visitaAtual===1?Number(planoAtual.valor):0):Number(s?.valor||0),owner_uid:usuarioAtual.uid};
    const ocupacao={agendamento_id:novoId,data:d.data,hora:d.hora,barbeiro_id:d.barbeiro,duracao_minutos:duracao,owner_uid:usuarioAtual.uid,atualizado_em:timestamp};
    if(novoId===antigo.id){transaction.update(refAntigo,dados);transaction.set(refOcupacaoAntiga,{...ocupacao,criado_em:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});return;}
    transaction.set(refNovo,{...dados,criado_em:antigo.criado_em||timestamp});transaction.set(refOcupacaoNova,{...ocupacao,criado_em:timestamp});transaction.delete(refAntigo);transaction.delete(refOcupacaoAntiga);
  });
}
async function enviarAgendamento(e){
  e.preventDefault();

  const btn = $('btnAgendar');

  const d = {
    nome:$('clienteNome').value.trim(),
    telefone:$('clienteTelefone').value.trim(),
    servico:$('servicoSelect').value,
    barbeiro:$('barbeiroSelect').value,
    data:$('dataAgendamento').value,
    hora:$('horaSolicitada').value,
    obs:$('observacao').value.trim(),
    plano:planoSelecionado
  };

  if(!d.servico){
    mostrarMensagem(
      'Primeiro toque em um dos serviços acima.',
      'erro'
    );

    $('cardsServicos')?.scrollIntoView({
      behavior:'smooth',
      block:'center'
    });

    return;
  }

  if(
    !d.nome ||
    telefoneLimpo(d.telefone).length < 10 ||
    !d.barbeiro ||
    !d.data ||
    !d.hora
  ){
    mostrarMensagem(
      'Confira nome, WhatsApp, data e horário.',
      'erro'
    );
    return;
  }

  const original = btn.innerHTML;

  btn.disabled = true;
  btn.textContent = 'Verificando...';

  try{

    /*
      REGRA PRINCIPAL:
      um telefone só pode possuir
      um agendamento ativo por dia.
    */
    const existente =
      await buscarAgendamentoDoCliente(
        d.data,
        d.telefone
      );

    if(existente){

      const mesmoServico =
        String(existente.servico_id) ===
        String(d.servico);

      const mesmoHorario =
        String(existente.hora || '').slice(0,5) ===
        String(d.hora).slice(0,5);

      /*
        Mesmo cliente tentando repetir
        exatamente o mesmo agendamento.
      */
      if(mesmoServico && mesmoHorario){

        mostrarMensagem(
          `Você já está agendado para ${d.hora} neste dia.`,
          'erro'
        );

        return;
      }

      /*
        Cliente só pode alterar
        enquanto o horário antigo
        ainda não começou.
      */
      if(!aindaPodeAlterar(existente)){

        mostrarMensagem(
          'Você já possui um atendimento neste dia e o horário não pode mais ser alterado.',
          'erro'
        );

        return;
      }

      const servicoAntigo =
        existente.servico_nome ||
        existente.servico_id ||
        'serviço';

      const confirma = window.confirm(
        `Você já possui um agendamento neste dia.\n\n` +
        `Atual: ${existente.hora} - ${servicoAntigo}\n` +
        `Novo: ${d.hora} - ${servicoAtual()?.nome || d.servico}\n\n` +
        `Deseja substituir o agendamento anterior?`
      );

      if(!confirma){

        mostrarMensagem(
          'Seu agendamento anterior foi mantido.',
          'warn'
        );

        return;
      }

      btn.textContent = 'Alterando...';

      if(!d.plano){d.plano=(cfg.planosMensais||[]).find(p=>String(existente.servico_nome||'').includes(p.nome))||null;}if(d.plano){const mv=String(existente.servico_nome||'').match(/visita\s*0*(\d+)/i);d.planoVisita=mv?Number(mv[1])||1:1;}
      await alterarAgendamento(
        existente,
        d
      );
      await registrarCliente(d);

      mostrarMensagem(
        'Agendamento alterado com sucesso. O horário anterior foi substituído.',
        'ok'
      );

      mostrarConfirmacaoAgendamento(d);
      planoSelecionado=null;

      await gerarHorarios();

      return;
    }

    /*
      Cliente não possui agendamento.
      Agora verificamos conflito
      com outra pessoa.
    */
    const ocupado =
      await horarioOcupadoPorOutro(
        d.data,
        d.barbeiro,
        d.hora
      );

    if(ocupado){

      mostrarMensagem(
        'Este horário não está mais disponível. Escolha outro horário.',
        'erro'
      );

      await gerarHorarios();

      return;
    }

    btn.textContent = 'Reservando...';

    if(d.plano)d.planoVisita=await proximaVisitaMensalCliente(d);
    await salvarNovoAgendamento(d);
    await registrarCliente(d);

    mostrarMensagem(
      'Agendamento confirmado automaticamente. Seu horário já está reservado.',
      'ok'
    );

    mostrarConfirmacaoAgendamento(d);

    await gerarHorarios();

  }catch(err){

    console.error(err);

    if(
      String(err?.message || '')
        .includes('HORARIO_OCUPADO')
    ){

      mostrarMensagem(
        'Este horário acabou de ser ocupado. Escolha outro horário.',
        'erro'
      );

    }else{

      const detalhe=err?.code==='permission-denied'
        ?'O Firebase recusou a gravação. Avise a barbearia para revisar as permissões do sistema.'
        :err?.code==='unavailable'
          ?'Sem conexão com o sistema agora. Confira a internet e tente novamente.'
          :'Não foi possível concluir o agendamento. Confira seus dados e tente novamente.';
      mostrarMensagem(detalhe,'erro');
    }

    await gerarHorarios();

  }finally{

    btn.disabled = false;
    btn.innerHTML = original;
  }
}

  function ouvirOcupacoes(){
    if(pararDeOuvirOcupacoes){pararDeOuvirOcupacoes();pararDeOuvirOcupacoes=null;}
    const data=$('dataAgendamento')?.value,barbeiro=$('barbeiroSelect')?.value;if(!data||!barbeiro)return;
    pararDeOuvirOcupacoes=db.collection('ocupacoes').where('data','==',data).where('barbeiro_id','==',barbeiro).onSnapshot(()=>gerarHorarios(),e=>console.warn('Atualização de horários indisponível:',e));
  }
  function prepararTela(){
    const data=$('dataAgendamento');if(data){data.min=hoje();data.value=hoje()}
    if($('textoEndereco'))$('textoEndereco').textContent=cfg.endereco||'';if($('footerEndereco'))$('footerEndereco').textContent=cfg.endereco||'';
    if($('linkWhatsappTopo'))$('linkWhatsappTopo').href=`https://wa.me/${String(cfg.whatsapp||'').replace(/\D/g,'')}`;
    if($('linkRota'))$('linkRota').href=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cfg.endereco||cfg.nome||'')}`;
    $('btnFecharConfirmacao')?.addEventListener('click',fecharConfirmacaoAgendamento);
    $('btnConcluirConfirmacao')?.addEventListener('click',fecharConfirmacaoAgendamento);
    $('modalAgendamentoConfirmado')?.addEventListener('click',e=>{if(e.target.id==='modalAgendamentoConfirmado')fecharConfirmacaoAgendamento()});
    $('clienteTelefone')?.addEventListener('input',e=>e.target.value=formatarTelefone(e.target.value));$('dataAgendamento')?.addEventListener('change',()=>{gerarHorarios();ouvirOcupacoes()});$('barbeiroSelect')?.addEventListener('change',()=>{gerarHorarios();ouvirOcupacoes()});$('formAgendamento')?.addEventListener('submit',enviarAgendamento);
    if($('statusSistema'))$('statusSistema').textContent='Agendamento automático';if($('statusDetalhe'))$('statusDetalhe').textContent='Escolha um serviço e finalize seu horário.';
  }

  window.addEventListener('DOMContentLoaded',async()=>{prepararTela();await carregarConfiguracoes();await carregarCatalogo();await gerarHorarios()});
})();
