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

  const hoje = () => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const moeda = v => Number(v || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const telefoneLimpo = v => String(v || '').replace(/\D/g,'').replace(/^55(?=\d{10,11}$)/,'');
  const formatarTelefone = v => {const n=telefoneLimpo(v).slice(0,11);if(n.length<=2)return n;if(n.length<=7)return `(${n.slice(0,2)}) ${n.slice(2,3)} ${n.slice(3)}`;return `(${n.slice(0,2)}) ${n.slice(2,3)} ${n.slice(3,7)} ${n.slice(7)}`};
  const minutos = h => {const [hh,mm]=String(h).split(':').map(Number);return hh*60+mm};
  const horaTexto = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
  const diaSemana = data => new Date(`${data}T12:00:00`).getDay();
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

  function ativarCards(){
    document.querySelectorAll('.service-card[data-service]').forEach(card=>card.addEventListener('click',()=>selecionarServico(card.dataset.service,true)));
  }

  async function carregarCatalogo(){try{carregarServicos();await carregarBarbeiros();ativarCards()}catch(e){console.error(e);mostrarMensagem('Não foi possível carregar os dados da barbearia agora.','erro')}}

  async function agendamentosOcupados(){
    const data=$('dataAgendamento')?.value,barbeiro=$('barbeiroSelect')?.value;
    if(!data||!barbeiro)return [];
    try{
      const snap=await db.collection('agendamentos').where('data','==',data).where('barbeiro_id','==',barbeiro).get();
      return snap.docs.map(doc=>doc.data())
        .filter(item=>!['cancelado','finalizado'].includes(String(item.status||'pendente')))
        .map(item=>({inicio:minutos(String(item.hora||item.hora_solicitada||'').slice(0,5)),duracao:Number(item.duracao_minutos||30)}))
        .filter(item=>Number.isFinite(item.inicio));
    }catch(e){console.warn('Consulta pública de horários indisponível',e);return []}
  }

  async function gerarHorarios(){
    const select=$('horaSolicitada');if(!select)return;
    const data=$('dataAgendamento')?.value;if(!data){select.innerHTML='<option value="">Escolha uma data</option>';return}
    const agendaDia=cfg.horariosSemana?.[diaSemana(data)];
    if(!agendaDia){select.innerHTML='<option value="">Fechado aos domingos</option>';return}
    const ocupados=await agendamentosOcupados();
    const inicio=minutos(agendaDia.inicio),fim=minutos(agendaDia.fim),intervalo=Number(cfg.intervalo||30),duracao=Number(servicoAtual()?.duracao_minutos||30),agora=new Date(),horarios=[];
    for(let m=inicio;m+duracao<=fim;m+=intervalo){
      const h=horaTexto(m);
      const conflita=ocupados.some(o=>m<o.inicio+o.duracao && m+duracao>o.inicio);
      if(conflita)continue;
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
    return [`Olá! Meu agendamento na ${cfg.nome} foi registrado.`,``,`Cliente: ${d.nome}`,`WhatsApp: ${d.telefone}`,`Serviço: ${s?.nome||d.servico}`,`Barbeiro: ${b?.nome||d.barbeiro}`,`Data: ${d.data.split('-').reverse().join('/')}`,`Horário: ${d.hora}`,d.obs?`Observação: ${d.obs}`:'',``,`Horário reservado automaticamente pelo sistema.`].filter(Boolean).join('\n');
  }

  function abrirWhatsApp(texto){const numero=String(cfg.whatsapp||'').replace(/\D/g,'');if(numero)window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`,'_blank','noopener')}

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

async function horarioOcupadoPorOutro(data,barbeiro,hora,ignorarId=null){
  const snap = await db
    .collection('agendamentos')
    .where('data','==',data)
    .where('barbeiro_id','==',barbeiro)
    .get();

  const novoInicio = minutos(hora);
  const novoServico = servicoAtual();
  const novaDuracao = Number(novoServico?.duracao_minutos || 30);

  return snap.docs.some(doc=>{
    if(ignorarId && doc.id===ignorarId) return false;

    const item = doc.data();

    if(
      ['cancelado','finalizado'].includes(
        String(item.status || '').toLowerCase()
      )
    ) return false;

    const inicio = minutos(
      String(item.hora || item.hora_solicitada || '').slice(0,5)
    );

    const duracao = Number(item.duracao_minutos || 30);

    return (
      novoInicio < inicio + duracao &&
      novoInicio + novaDuracao > inicio
    );
  });
}

async function salvarNovoAgendamento(d){
  const s = servicos.find(
    x => String(x.id) === String(d.servico)
  );

  const ref = db
    .collection('agendamentos')
    .doc(idReserva(d.data,d.barbeiro,d.hora));

  const existente = await ref.get();

  if(existente.exists){
    throw new Error('HORARIO_OCUPADO');
  }

  await garantirUsuario();

  await ref.set({
    nome:d.nome,
    telefone:telefoneLimpo(d.telefone),

    servico_id:d.servico,
    servico_nome:s?.nome || d.servico,
    duracao_minutos:Number(s?.duracao_minutos || 30),

    barbeiro_id:d.barbeiro,

    data:d.data,
    hora:d.hora,
    hora_solicitada:d.hora,

    observacao:d.obs || '',

    status:'pendente',

    criado_em:
      firebase.firestore.FieldValue.serverTimestamp(),

    atualizado_em:
      firebase.firestore.FieldValue.serverTimestamp(),

    valor:Number(s?.valor || 0),

    owner_uid: usuarioAtual.uid
  });
}

async function alterarAgendamento(antigo,d){
  await garantirUsuario();

  const s = servicos.find(
    x => String(x.id) === String(d.servico)
  );

  const ocupado = await horarioOcupadoPorOutro(
    d.data,
    d.barbeiro,
    d.hora,
    antigo.id
  );

  if(ocupado){
    throw new Error('HORARIO_OCUPADO');
  }

  const refAntigo = db
    .collection('agendamentos')
    .doc(antigo.id);

  const novoId = idReserva(
    d.data,
    d.barbeiro,
    d.hora
  );

  const dados = {
    nome:d.nome,
    telefone:telefoneLimpo(d.telefone),

    servico_id:d.servico,
    servico_nome:s?.nome || d.servico,
    duracao_minutos:Number(s?.duracao_minutos || 30),

    barbeiro_id:d.barbeiro,

    data:d.data,
    hora:d.hora,
    hora_solicitada:d.hora,

    observacao:d.obs || '',

    status:'pendente',

    atualizado_em:
      firebase.firestore.FieldValue.serverTimestamp(),

    valor:Number(s?.valor || 0),

    owner_uid: usuarioAtual.uid
  };

  if(novoId === antigo.id){
    await refAntigo.update(dados);
    return;
  }

  const novoRef = db
    .collection('agendamentos')
    .doc(novoId);

  const existeNovo = await novoRef.get();

  if(existeNovo.exists){
    throw new Error('HORARIO_OCUPADO');
  }

  const batch = db.batch();

  batch.set(novoRef,{
    ...dados,
    criado_em:
      antigo.criado_em ||
      firebase.firestore.FieldValue.serverTimestamp()
  });

  batch.delete(refAntigo);

  await batch.commit();
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
    obs:$('observacao').value.trim()
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

      await alterarAgendamento(
        existente,
        d
      );

      mostrarMensagem(
        'Agendamento alterado com sucesso. O horário anterior foi substituído.',
        'ok'
      );

      abrirWhatsApp(
        mensagemWhatsApp(d)
      );

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

    await salvarNovoAgendamento(d);

    mostrarMensagem(
      'Agendamento confirmado automaticamente. Seu horário já está reservado.',
      'ok'
    );

    abrirWhatsApp(
      mensagemWhatsApp(d)
    );

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

      mostrarMensagem(
        'Não foi possível concluir o agendamento agora.',
        'erro'
      );
    }

    await gerarHorarios();

  }finally{

    btn.disabled = false;
    btn.innerHTML = original;
  }
}

  function prepararTela(){
    const data=$('dataAgendamento');if(data){data.min=hoje();data.value=hoje()}
    if($('textoEndereco'))$('textoEndereco').textContent=cfg.endereco||'';if($('footerEndereco'))$('footerEndereco').textContent=cfg.endereco||'';
    if($('linkWhatsappTopo'))$('linkWhatsappTopo').href=`https://wa.me/${String(cfg.whatsapp||'').replace(/\D/g,'')}`;
    if($('linkRota'))$('linkRota').href=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cfg.endereco||cfg.nome||'')}`;
    $('clienteTelefone')?.addEventListener('input',e=>e.target.value=formatarTelefone(e.target.value));$('dataAgendamento')?.addEventListener('change',gerarHorarios);$('barbeiroSelect')?.addEventListener('change',gerarHorarios);$('formAgendamento')?.addEventListener('submit',enviarAgendamento);
    if($('statusSistema'))$('statusSistema').textContent='Agendamento automático';if($('statusDetalhe'))$('statusDetalhe').textContent='Escolha um serviço e finalize seu horário.';
  }

  window.addEventListener('DOMContentLoaded',async()=>{prepararTela();await carregarConfiguracoes();await carregarCatalogo();await gerarHorarios()});
})();
