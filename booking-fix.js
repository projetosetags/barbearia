/* Barbearia Leandro David — disponibilidade e reserva atômica */
(() => {
  const cfg = window.BARBEARIA_CONFIG || {};
  const fb = window.FB_CONFIG || {};
  const $ = id => document.getElementById(id);
  if (!window.firebase || !fb.apiKey || !fb.projectId) return;
  if (!firebase.apps.length) firebase.initializeApp(fb);
  const db = firebase.firestore();
  const auth = firebase.auth();

  const hoje = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const min = h => { const [a,b]=String(h||'').slice(0,5).split(':').map(Number); return a*60+b; };
  const hora = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
  const diaSemana = data => { const [a,m,d]=data.split('-').map(Number); return new Date(a,m-1,d,12).getDay(); };
  const tel = v => String(v||'').replace(/\D/g,'').replace(/^55(?=\d{10,11}$)/,'');
  const servico = () => (cfg.servicosPadrao||[]).find(s=>String(s.id)===String($('servicoSelect')?.value));
  const msg = (t,tipo='ok') => { const e=$('mensagem'); if(e){e.textContent=t;e.className=`mensagem ${tipo}`;} };
  const reservaId = (data,barbeiro,h) => `${data}_${String(barbeiro||'barbeiro').replace(/[^a-zA-Z0-9_-]/g,'-')}_${String(h).slice(0,5).replace(':','-')}`;

  async function usuario(){
    if(auth.currentUser) return auth.currentUser;
    return (await auth.signInAnonymously()).user;
  }

  async function agendaDoDia(data){
    // A agenda semanal é a fonte principal. Um registro especial só fecha o dia
    // quando isso estiver explicitamente marcado; registros antigos/incompletos
    // não podem zerar os horários do cliente.
    const padrao = cfg.horariosSemana?.[diaSemana(data)] || null;
    try{
      const doc = await db.collection('horarios_especiais').doc(data).get();
      if(doc.exists){
        const x=doc.data()||{};
        if(x.fechado===true && x.ativo===true) return null;
        if(
          x.ativo===true &&
          /^\d{2}:\d{2}$/.test(x.inicio||'') &&
          /^\d{2}:\d{2}$/.test(x.fim||'') &&
          min(x.fim)>min(x.inicio)
        ) return {inicio:x.inicio,fim:x.fim};
      }
    }catch(e){ console.warn('Horário especial:',e); }
    return padrao;
  }

  async function ocupacoes(data,barbeiro){
    try{
      const snap=await db.collection('ocupacoes').where('data','==',data).where('barbeiro_id','==',barbeiro).get();
      return snap.docs.map(d=>({id:d.id,...d.data()}));
    }catch(e){ console.warn('Ocupações:',e); return []; }
  }

  async function bloqueios(data,barbeiro){
    let lista=[...(cfg.bloqueiosPadrao?.[diaSemana(data)]||[])];
    try{
      const snap=await db.collection('bloqueios').where('data','==',data).get();
      lista.push(...snap.docs.map(d=>d.data()).filter(x=>!x.barbeiro_id||x.barbeiro_id===barbeiro));
    }catch(e){ console.warn('Bloqueios:',e); }
    try{
      const lib=await db.collection('liberacoes').doc(data).get();
      if(lib.exists){
        const periodos=lib.data()?.periodos||[];
        lista=lista.filter(b=>!periodos.some(l=>min(l.inicio)<=min(b.inicio)&&min(l.fim)>=min(b.fim)));
      }
    }catch(e){ console.warn('Liberações:',e); }
    return lista;
  }

  async function atualizarHorarios(){
    const sel=$('horaSolicitada'); if(!sel) return;
    const data=$('dataAgendamento')?.value;
    const barbeiro=$('barbeiroSelect')?.value;
    if(!data){sel.innerHTML='<option value="">Escolha uma data</option>';return;}
    if(!barbeiro){sel.innerHTML='<option value="">Escolha o profissional</option>';return;}
    const agenda=await agendaDoDia(data);
    if(!agenda){sel.innerHTML='<option value="">Fechado neste dia</option>';return;}
    const [ocup,bloq]=await Promise.all([ocupacoes(data,barbeiro),bloqueios(data,barbeiro)]);
    const dur=Number(servico()?.duracao||30);
    const passo=Number(cfg.intervalo||30);
    const ini=min(agenda.inicio), fim=min(agenda.fim);
    if(!Number.isFinite(ini)||!Number.isFinite(fim)||fim<=ini){sel.innerHTML='<option value="">Horário do dia indisponível</option>';return;}
    const agora=new Date(); const lista=[];
    for(let m=ini;m+dur<=fim;m+=passo){
      const conflito=ocup.some(o=>m < min(o.hora)+Number(o.duracao_minutos||30) && m+dur > min(o.hora));
      const bloqueado=bloq.some(b=>m < min(b.fim) && m+dur > min(b.inicio));
      if(conflito||bloqueado) continue;
      if(data===hoje()){
        const alvo=new Date(); alvo.setHours(Math.floor(m/60),m%60,0,0);
        if(alvo.getTime()<agora.getTime()+20*60000) continue;
      }
      lista.push(hora(m));
    }
    const anterior=sel.value;
    sel.innerHTML=lista.length?lista.map(h=>`<option value="${h}">${h}</option>`).join(''):'<option value="">Sem horários disponíveis</option>';
    if(lista.includes(anterior)) sel.value=anterior;
  }

  async function reservarAtomico(d){
    const u=await usuario();
    const s=servico();
    const dur=Number(s?.duracao||30);
    const id=reservaId(d.data,d.barbeiro,d.hora);
    const occRef=db.collection('ocupacoes').doc(id);
    const agRef=db.collection('agendamentos').doc(id);

    // Confere sobreposição imediatamente antes da transação.
    const atuais=await ocupacoes(d.data,d.barbeiro);
    const inicio=min(d.hora);
    if(atuais.some(o=>inicio < min(o.hora)+Number(o.duracao_minutos||30) && inicio+dur > min(o.hora))) throw new Error('HORARIO_OCUPADO');

    await db.runTransaction(async tx=>{
      const occ=await tx.get(occRef);
      if(occ.exists) throw new Error('HORARIO_OCUPADO');
      const timestamp=firebase.firestore.FieldValue.serverTimestamp();
      tx.set(occRef,{agendamento_id:id,data:d.data,hora:d.hora,barbeiro_id:d.barbeiro,duracao_minutos:dur,owner_uid:u.uid,criado_em:timestamp});
      tx.set(agRef,{nome:d.nome,telefone:tel(d.telefone),servico_id:d.servico,servico_nome:s?.nome||d.servico,duracao_minutos:dur,barbeiro_id:d.barbeiro,data:d.data,hora:d.hora,hora_solicitada:d.hora,observacao:d.obs||'',status:'pendente',valor:Number(s?.valor||0),owner_uid:u.uid,criado_em:timestamp,atualizado_em:timestamp});
    });
    try{
      await db.collection('clientes').doc('tel_'+tel(d.telefone)).set({nome:d.nome,telefone:tel(d.telefone),owner_uid:u.uid,atualizado_em:firebase.firestore.FieldValue.serverTimestamp(),criado_por:'cliente'},{merge:true});
    }catch(e){console.warn('Cliente:',e);}
  }

  async function enviar(e){
    e.preventDefault(); e.stopImmediatePropagation();
    const btn=$('btnAgendar');
    const d={nome:$('clienteNome')?.value.trim(),telefone:$('clienteTelefone')?.value.trim(),servico:$('servicoSelect')?.value,barbeiro:$('barbeiroSelect')?.value,data:$('dataAgendamento')?.value,hora:$('horaSolicitada')?.value,obs:$('observacao')?.value.trim()};
    if(!d.servico){msg('Primeiro toque em um dos serviços acima.','erro');$('cardsServicos')?.scrollIntoView({behavior:'smooth',block:'center'});return;}
    if(!d.nome||tel(d.telefone).length<10||!d.barbeiro||!d.data||!d.hora){msg('Confira nome, WhatsApp, data e horário.','erro');return;}
    const original=btn?.innerHTML; if(btn){btn.disabled=true;btn.textContent='Reservando...';}
    try{
      await reservarAtomico(d);
      msg('Agendamento confirmado. Este horário já foi bloqueado para outros clientes.','ok');
      const numero=String(cfg.whatsapp||'').replace(/\D/g,'');
      if(numero){
        const texto=`Olá! Meu agendamento na ${cfg.nome} foi registrado.\n\nCliente: ${d.nome}\nServiço: ${servico()?.nome||d.servico}\nData: ${d.data.split('-').reverse().join('/')}\nHorário: ${d.hora}\n\nHorário reservado automaticamente pelo sistema.`;
        window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`,'_blank','noopener');
      }
    }catch(err){
      console.error(err);
      msg(String(err?.message||'').includes('HORARIO_OCUPADO')?'Este horário acabou de ser ocupado. Escolha outro horário.':'Não foi possível concluir o agendamento agora.','erro');
    }finally{
      await atualizarHorarios();
      if(btn){btn.disabled=false;btn.innerHTML=original;}
    }
  }

  function iniciar(){
    const form=$('formAgendamento');
    if(form) form.addEventListener('submit',enviar,true);
    $('dataAgendamento')?.addEventListener('change',atualizarHorarios);
    $('barbeiroSelect')?.addEventListener('change',atualizarHorarios);
    document.querySelectorAll('.service-card[data-service]').forEach(card=>card.addEventListener('click',()=>{
      setTimeout(atualizarHorarios,0);
      setTimeout(atualizarHorarios,350);
      setTimeout(atualizarHorarios,900);
    }));
    // O app principal carrega catálogos de forma assíncrona. Reaplicamos a
    // disponibilidade após essa carga para garantir que o select final fique
    // sempre com os horários livres, e não com uma mensagem antiga.
    atualizarHorarios();
    setTimeout(atualizarHorarios,250);
    setTimeout(atualizarHorarios,800);
    setTimeout(atualizarHorarios,1600);

    // Atualiza a lista quando outro cliente reserva/cancela no mesmo dia.
    let cancelar=null;
    const ouvir=()=>{
      if(cancelar){cancelar();cancelar=null;}
      const data=$('dataAgendamento')?.value,barbeiro=$('barbeiroSelect')?.value;
      if(!data||!barbeiro)return;
      cancelar=db.collection('ocupacoes').where('data','==',data).where('barbeiro_id','==',barbeiro).onSnapshot(()=>atualizarHorarios(),e=>console.warn('Tempo real:',e));
    };
    $('dataAgendamento')?.addEventListener('change',ouvir);
    $('barbeiroSelect')?.addEventListener('change',ouvir);
    ouvir();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',iniciar);
  else iniciar();
})();
