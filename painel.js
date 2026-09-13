(()=>{
const $=id=>document.getElementById(id);
const hoje=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const moeda=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const EMAIL_LEANDRO='leandro00black@gmail.com';
let db=null,auth=null;
function mensagem(txt,tipo='warn'){const e=$('loginMsg');if(e){e.textContent=txt;e.className=`mensagem ${tipo}`}}
function iniciar(){if(!window.firebase||!window.FB_CONFIG?.apiKey)return false;try{if(!firebase.apps.length)firebase.initializeApp(window.FB_CONFIG);auth=firebase.auth();db=firebase.firestore();return true}catch(e){console.error(e);return false}}
function statusLabel(status){if(status==='finalizado')return 'Finalizado';if(status==='cancelado')return 'Cancelado';if(status==='em_atendimento')return 'Em atendimento';return 'Agendado automaticamente'}
async function carregarAgenda(){
 const data=$('dataPainel').value,box=$('agendaDia');
 try{
  const snap=await db.collection('agendamentos').where('data','==',data).get();
  const itens=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(a.hora).localeCompare(String(b.hora)));
  $('kpiTotal').textContent=itens.length;
  $('kpiPendentes').textContent=itens.filter(x=>!['finalizado','cancelado'].includes(x.status)).length;
  $('kpiFinalizados').textContent=itens.filter(x=>x.status==='finalizado').length;
  $('kpiReceita').textContent=moeda(itens.filter(x=>x.status==='finalizado').reduce((s,x)=>s+Number(x.valor||0),0));
  $('statusAdmin').textContent=`Firebase conectado • ${itens.length} agendamento(s)`;
  if(!itens.length){box.className='empty';box.textContent='Nenhum agendamento encontrado.';return}
  box.className='';
  box.innerHTML=itens.map(x=>`<article class="agenda-item"><div><strong>${x.hora} • ${x.nome||'Cliente'}</strong><span>${x.telefone||''}</span><small>${x.servico_id||''} • ${statusLabel(x.status)}</small></div><div>${x.status!=='finalizado'?`<button class="secondary" data-id="${x.id}" data-status="finalizado">Finalizar</button>`:''}${x.status!=='cancelado'&&x.status!=='finalizado'?`<button class="secondary" data-id="${x.id}" data-status="cancelado">Cancelar</button>`:''}</div></article>`).join('');
  box.querySelectorAll('button[data-id]').forEach(b=>b.onclick=async()=>{await db.collection('agendamentos').doc(b.dataset.id).update({status:b.dataset.status});carregarAgenda()});
 }catch(e){console.error(e);$('statusAdmin').textContent='Erro ao consultar o Firestore.'}
}
window.addEventListener('DOMContentLoaded',()=>{
 if($('dataPainel'))$('dataPainel').value=hoje();
 if(!iniciar()){mensagem('Firebase não configurado.');return}
 $('btnEntrar').onclick=async()=>{
  const usuario=$('email').value.trim();const senha=$('senha').value;
  const email=!usuario.includes('@')&&usuario.toLowerCase()==='leandro'?EMAIL_LEANDRO:usuario;
  if(!email){mensagem('Informe o usuário ou e-mail.','erro');return}
  try{await auth.signInWithEmailAndPassword(email,senha);mensagem('','ok')}catch(e){mensagem('Usuário/e-mail ou senha inválidos.','erro')}
 };
 $('btnSair').onclick=()=>auth.signOut();
 $('dataPainel').addEventListener('change',carregarAgenda);
 auth.onAuthStateChanged(user=>{if(user){$('loginWrap').classList.add('hidden');$('painel').classList.remove('hidden');$('perfil').textContent=user.email===EMAIL_LEANDRO?'Leandro':'Administrador';carregarAgenda()}else{$('painel').classList.add('hidden');$('loginWrap').classList.remove('hidden')}})
});
})();