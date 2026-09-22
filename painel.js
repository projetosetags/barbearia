(()=>{
const $=id=>document.getElementById(id);
const cfg=window.BARBEARIA_CONFIG||{};
const EMAIL_LEANDRO='leandro00black@gmail.com';
const EMAIL_ADMIN='phdbr68@gmail.com';
const ADMINS=[EMAIL_LEANDRO,EMAIL_ADMIN];
let db=null,auth=null,modo='hoje',inicioAtual='',fimAtual='',itensAtuais=[];
const servicos=(cfg.servicosPadrao||[]).map(s=>({id:s.id,nome:s.nome,valor:Number(s.valor||0),duracao:Number(s.duracao||30)}));
const moeda=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const iso=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const hoje=()=>iso(new Date());
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function mensagem(txt,tipo='warn'){const e=$('loginMsg');if(e){e.textContent=txt;e.className=`msg ${tipo}`}}
function iniciar(){try{if(!firebase.apps.length)firebase.initializeApp(window.FB_CONFIG);auth=firebase.auth();db=firebase.firestore();return true}catch(e){console.error(e);return false}}
function emailDoUsuario(v){const u=String(v||'').trim();return !u.includes('@')&&u.toLowerCase()==='leandro'?EMAIL_LEANDRO:u.toLowerCase()}
function autorizado(v){return ADMINS.includes(String(v||'').toLowerCase())}
function addDias(data,n){const d=new Date(data+'T12:00:00');d.setDate(d.getDate()+n);return iso(d)}
function periodoSemana(){const d=new Date();const day=d.getDay();const delta=day===0?-6:1-day;const ini=new Date(d);ini.setDate(d.getDate()+delta);return[iso(ini),iso(new Date(ini.getFullYear(),ini.getMonth(),ini.getDate()+6))]}
function fimAtendimento(x){const dur=Number(x.duracao_minutos||30);return new Date(`${x.data}T${String(x.hora||'00:00').slice(0,5)}:00-03:00`).getTime()+dur*60000}
function statusVisual(x){if(x.status==='cancelado')return['Cancelado','cancelado'];if(x.status==='finalizado')return['Finalizado','finalizado'];return['Agendado','agendado']}
async function finalizarPassados(itens){const agora=Date.now();const alvos=itens.filter(x=>!['finalizado','cancelado'].includes(x.status)&&fimAtendimento(x)<=agora);if(!alvos.length)return false;await Promise.all(alvos.map(x=>db.collection('agendamentos').doc(x.id).update({status:'finalizado'}).catch(console.error)));return true}
async function consultarPeriodo(ini,fim){let q=db.collection('agendamentos').where('data','>=',ini).where('data','<=',fim);const snap=await q.get();return snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>`${a.data} ${a.hora}`.localeCompare(`${b.data} ${b.hora}`))}
function renderKPIs(itens){$('kpiTotal').textContent=itens.length;$('kpiPendentes').textContent=itens.filter(x=>!['finalizado','cancelado'].includes(x.status)).length;$('kpiFinalizados').textContent=itens.filter(x=>x.status==='finalizado').length;$('kpiReceita').textContent=moeda(itens.filter(x=>x.status==='finalizado').reduce((s,x)=>s+Number(x.valor||0),0))}
function renderTabela(itens){const body=$('agendaBody');if(!itens.length){body.innerHTML='<tr><td colspan="8" class="empty">Nenhum agendamento neste período.</td></tr>';return}body.innerHTML=itens.map(x=>{const [st,cl]=statusVisual(x);return `<tr><td>${esc(x.data?.split('-').reverse().join('/'))}</td><td><b>${esc(String(x.hora||'').slice(0,5))}</b></td><td>${esc(x.nome||'')}</td><td>${esc(x.telefone||'')}</td><td>${esc(x.servico_nome||x.servico_id||'')}</td><td>${moeda(x.valor)}</td><td><span class="status ${cl}">${st}</span></td><td><div class="actions"><button class="btn" data-edit="${x.id}">Editar</button><button class="btn danger" data-del="${x.id}">Excluir</button></div></td></tr>`}).join('');body.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>abrirEdicao(b.dataset.edit));body.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>excluir(b.dataset.del))}
async function carregar(){try{$('statusAdmin').textContent='Atualizando...';let ini,fim,titulo;if(modo==='hoje'){ini=fim=hoje();titulo='Agenda do dia'}else if(modo==='semana'){[ini,fim]=periodoSemana();titulo='Agenda da semana'}else{ini=$('dataInicio').value;fim=$('dataFim').value;if(!ini||!fim||fim<ini)return;titulo='Agenda do período'}inicioAtual=ini;fimAtual=fim;let itens=await consultarPeriodo(ini,fim);if(await finalizarPassados(itens))itens=await consultarPeriodo(ini,fim);itensAtuais=itens;$('tituloAgenda').textContent=titulo;$('subtituloAgenda').textContent=ini===fim?ini.split('-').reverse().join('/'):`${ini.split('-').reverse().join('/')} a ${fim.split('-').reverse().join('/')}`;renderKPIs(itens);renderTabela(itens);$('statusAdmin').textContent=`Firebase conectado • ${itens.length} registro(s)`}catch(e){console.error(e);$('statusAdmin').textContent='Erro ao carregar agenda'}}
function setModo(novo){modo=novo;['fHoje','fSemana','fPersonalizado'].forEach(id=>$(id).classList.remove('active'));$(novo==='hoje'?'fHoje':novo==='semana'?'fSemana':'fPersonalizado').classList.add('active');$('rangePersonalizado').classList.toggle('hidden',novo!=='personalizado');if(novo!=='personalizado')carregar()}
function preencherServicos(){const sel=$('editServico');sel.innerHTML=servicos.map(s=>`<option value="${s.id}">${esc(s.nome)}</option>`).join('');sel.onchange=()=>{const s=servicos.find(x=>x.id===sel.value);if(s){$('editValor').value=s.valor;$('editDuracao').value=s.duracao}}}
function abrirNovo(){preencherServicos();$('modalTitulo').textContent='Novo agendamento';$('editId').value='';$('editNome').value='';$('editTelefone').value='';$('editData').value=hoje();$('editHora').value='09:00';$('editStatus').value='pendente';if(servicos[0]){$('editServico').value=servicos[0].id;$('editValor').value=servicos[0].valor;$('editDuracao').value=servicos[0].duracao}$('btnExcluir').classList.add('hidden');$('modalAgendamento').classList.remove('hidden')}
function abrirEdicao(id){const x=itensAtuais.find(i=>i.id===id);if(!x)return;preencherServicos();$('modalTitulo').textContent='Editar agendamento';$('editId').value=id;$('editNome').value=x.nome||'';$('editTelefone').value=x.telefone||'';$('editServico').value=x.servico_id||servicos[0]?.id||'';$('editData').value=x.data||hoje();$('editHora').value=String(x.hora||'').slice(0,5);$('editStatus').value=x.status||'pendente';$('editValor').value=Number(x.valor||0);$('editDuracao').value=Number(x.duracao_minutos||30);$('btnExcluir').classList.remove('hidden');$('modalAgendamento').classList.remove('hidden')}
function fecharModal(){$('modalAgendamento').classList.add('hidden')}
function idReservaAdmin(data,barbeiro,hora){return `${data}_${String(barbeiro||'leandro-david').replace(/[^a-zA-Z0-9_-]/g,'-')}_${String(hora||'').slice(0,5).replace(':','-')}`}
async function salvar(){
  const id=$('editId').value;
  const s=servicos.find(x=>x.id===$('editServico').value);
  const user=auth.currentUser;
  const dados={
    nome:$('editNome').value.trim(),
    telefone:$('editTelefone').value.replace(/\D/g,''),
    servico_id:$('editServico').value,
    servico_nome:s?.nome||$('editServico').value,
    duracao_minutos:Number($('editDuracao').value||30),
    barbeiro_id:'leandro-david',
    data:$('editData').value,
    hora:$('editHora').value,
    hora_solicitada:$('editHora').value,
    observacao:'',
    valor:Number($('editValor').value||0),
    status:$('editStatus').value||'pendente',
    owner_uid:user?.uid||''
  };
  if(!dados.nome||!dados.data||!dados.hora)return alert('Preencha nome, data e horário.');
  try{
    const novoId=idReservaAdmin(dados.data,dados.barbeiro_id,dados.hora);
    const refNovo=db.collection('agendamentos').doc(novoId);
    const occNovo=db.collection('ocupacoes').doc(novoId);

    if(!id){
      const tel=dados.telefone;
      const mesmoDia=await db.collection('agendamentos').where('data','==',dados.data).get();
      const duplicado=mesmoDia.docs.some(d=>{
        const x=d.data();
        return String(x.telefone||'')===tel && !['cancelado'].includes(String(x.status||''));
      });
      if(duplicado && !confirm('Este cliente já possui agendamento neste dia. Deseja continuar mesmo assim?'))return;

      const existe=await occNovo.get();
      if(existe.exists)return alert('Este horário já está ocupado.');
      const batch=db.batch();
      batch.set(refNovo,{...dados,criado_em:firebase.firestore.FieldValue.serverTimestamp(),atualizado_em:firebase.firestore.FieldValue.serverTimestamp()});
      batch.set(occNovo,{agendamento_id:novoId,data:dados.data,hora:dados.hora,barbeiro_id:dados.barbeiro_id,duracao_minutos:dados.duracao_minutos,owner_uid:dados.owner_uid,criado_em:firebase.firestore.FieldValue.serverTimestamp()});
      await batch.commit();
    }else{
      const antigo=itensAtuais.find(x=>x.id===id);
      const mudouId=novoId!==id;
      if(mudouId){
        const existe=await occNovo.get();
        if(existe.exists)return alert('Este horário já está ocupado.');
      }
      const batch=db.batch();
      const refAntigo=db.collection('agendamentos').doc(id);
      const occAntigo=db.collection('ocupacoes').doc(id);
      if(dados.status==='cancelado'||dados.status==='finalizado'){
        batch.set(mudouId?refNovo:refAntigo,{...dados,atualizado_em:firebase.firestore.FieldValue.serverTimestamp(),criado_em:antigo?.criado_em||firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
        batch.delete(occAntigo);
        if(mudouId)batch.delete(refAntigo);
      }else{
        batch.set(refNovo,{...dados,atualizado_em:firebase.firestore.FieldValue.serverTimestamp(),criado_em:antigo?.criado_em||firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
        batch.set(occNovo,{agendamento_id:novoId,data:dados.data,hora:dados.hora,barbeiro_id:dados.barbeiro_id,duracao_minutos:dados.duracao_minutos,owner_uid:dados.owner_uid,atualizado_em:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
        if(mudouId){batch.delete(refAntigo);batch.delete(occAntigo)}
      }
      await batch.commit();
    }
    fecharModal();
    await carregar();
  }catch(e){console.error(e);alert('Não foi possível salvar. Verifique se o horário está livre e as regras do Firebase.')}
}
async function excluir(id){if(!confirm('Excluir este agendamento?'))return;try{const batch=db.batch();batch.delete(db.collection('agendamentos').doc(id));batch.delete(db.collection('ocupacoes').doc(id));await batch.commit();fecharModal();await carregar()}catch(e){console.error(e);alert('Não foi possível excluir.')}}
window.addEventListener('DOMContentLoaded',()=>{if(!iniciar()){mensagem('Firebase não configurado.','erro');return}$('btnEntrar').onclick=async()=>{const email=emailDoUsuario($('email').value),senha=$('senha').value;if(!autorizado(email))return mensagem('Usuário sem acesso ao painel.','erro');try{await auth.signInWithEmailAndPassword(email,senha)}catch(e){console.error(e);mensagem('Usuário ou senha inválidos.','erro')}};$('btnSair').onclick=()=>auth.signOut();$('fHoje').onclick=()=>setModo('hoje');$('fSemana').onclick=()=>setModo('semana');$('fPersonalizado').onclick=()=>setModo('personalizado');$('btnAplicarPeriodo').onclick=carregar;$('btnAtualizar').onclick=carregar;$('btnNovo').onclick=abrirNovo;$('btnCompartilharCliente').onclick=async()=>{const url='https://projetosetags.github.io/barbearia/';try{if(navigator.share){await navigator.share({title:'Barbearia Leandro David',text:'Agende seu horário aqui:',url})}else{await navigator.clipboard.writeText(url);alert('Link do app copiado.')}}catch(_){}};$('btnFecharModal').onclick=fecharModal;$('btnCancelarModal').onclick=fecharModal;$('btnSalvar').onclick=salvar;$('btnExcluir').onclick=()=>excluir($('editId').value);const [si,sf]=periodoSemana();$('dataInicio').value=si;$('dataFim').value=sf;auth.onAuthStateChanged(async user=>{if(user){if(!autorizado(user.email)){await auth.signOut();return}$('loginWrap').classList.add('hidden');$('painel').classList.remove('hidden');$('perfil').textContent=user.email.toLowerCase()===EMAIL_ADMIN?'Administrador Total':'Leandro';carregar();setInterval(carregar,60000)}else{$('painel').classList.add('hidden');$('loginWrap').classList.remove('hidden')}})});
})();