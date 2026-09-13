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
  let servicos = [];
  let barbeiros = [];

  const hoje = () => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const moeda = v => Number(v || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const telefoneLimpo = v => String(v || '').replace(/\D/g,'').replace(/^55(?=\d{10,11}$)/,'');
  const formatarTelefone = v => {const n=telefoneLimpo(v).slice(0,11);if(n.length<=2)return n;if(n.length<=7)return `(${n.slice(0,2)}) ${n.slice(2,3)} ${n.slice(3)}`;return `(${n.slice(0,2)}) ${n.slice(2,3)} ${n.slice(3,7)} ${n.slice(7)}`};
  const minutos = h => {const [hh,mm]=String(h).split(':').map(Number);return hh*60+mm};
  const horaTexto = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
  const diaSemana = data => new Date(`${data}T12:00:00`).getDay();

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
      return snap.docs.map(doc=>doc.data()).filter(item=>['pendente','confirmado','em_atendimento'].includes(item.status)).map(item=>({inicio:minutos(String(item.hora).slice(0,5)),duracao:Number(item.duracao_minutos||30)}));
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

  async function salvarAgendamento(d){
    const s=servicos.find(x=>String(x.id)===String(d.servico));
    await db.collection('agendamentos').add({nome:d.nome,telefone:telefoneLimpo(d.telefone),servico_id:d.servico,servico_nome:s?.nome||d.servico,duracao_minutos:Number(s?.duracao_minutos||0),barbeiro_id:d.barbeiro,data:d.data,hora:d.hora,observacao:d.obs||'',status:'pendente',criado_em:firebase.firestore.FieldValue.serverTimestamp(),valor:Number(s?.valor||0)});
  }

  async function enviarAgendamento(e){
    e.preventDefault();const btn=$('btnAgendar');const d={nome:$('clienteNome').value.trim(),telefone:$('clienteTelefone').value.trim(),servico:$('servicoSelect').value,barbeiro:$('barbeiroSelect').value,data:$('dataAgendamento').value,hora:$('horaSolicitada').value,obs:$('observacao').value.trim()};
    if(!d.servico){mostrarMensagem('Primeiro toque em um dos serviços acima.','erro');$('cardsServicos')?.scrollIntoView({behavior:'smooth',block:'center'});return}
    if(!d.nome||telefoneLimpo(d.telefone).length<10||!d.barbeiro||!d.data||!d.hora){mostrarMensagem('Confira nome, WhatsApp, data e horário.','erro');return}
    const original=btn.innerHTML;btn.disabled=true;btn.textContent='Reservando...';
    try{await salvarAgendamento(d);mostrarMensagem('Agendamento confirmado automaticamente. Seu horário já está reservado.','ok');abrirWhatsApp(mensagemWhatsApp(d));await gerarHorarios()}catch(err){console.error(err);mostrarMensagem('Não foi possível registrar o agendamento agora.','erro')}finally{btn.disabled=false;btn.innerHTML=original}
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
