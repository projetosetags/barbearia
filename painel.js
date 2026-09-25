(()=>{
const $=id=>document.getElementById(id);
const cfg=window.BARBEARIA_CONFIG||{};
const EMAIL_LEANDRO='leandro00black@gmail.com';
const EMAIL_ADMIN='phdbr68@gmail.com';
const ADMINS=[EMAIL_LEANDRO,EMAIL_ADMIN];
let db=null,auth=null,modo='hoje',inicioAtual='',fimAtual='',itensAtuais=[],clientesAtuais=[];
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
async function sincronizarOcupacoesExistentes(){
  try{
    const snap=await db.collection('agendamentos').get();
    const ativos=snap.docs
      .map(d=>({id:d.id,...d.data()}))
      .filter(x=>!['cancelado','finalizado'].includes(String(x.status||'pendente').toLowerCase()))
      .filter(x=>x.data&&String(x.hora||x.hora_solicitada||'').slice(0,5));
    if(!ativos.length)return 0;
    let total=0;
    for(let i=0;i<ativos.length;i+=400){
      const lote=ativos.slice(i,i+400);
      const batch=db.batch();
      lote.forEach(x=>{
        const hora=String(x.hora||x.hora_solicitada||'').slice(0,5);
        const ref=db.collection('ocupacoes').doc(x.id);
        batch.set(ref,{
          agendamento_id:x.id,
          data:x.data,
          hora,
          barbeiro_id:x.barbeiro_id||'leandro-david',
          duracao_minutos:Number(x.duracao_minutos||30),
          owner_uid:x.owner_uid||auth.currentUser?.uid||'',
          sincronizado_em:firebase.firestore.FieldValue.serverTimestamp()
        },{merge:true});
      });
      await batch.commit();
      total+=lote.length;
    }
    return total;
  }catch(e){console.error('Falha ao sincronizar ocupações',e);return -1}
}
function renderKPIs(itens){$('kpiTotal').textContent=itens.length;$('kpiPendentes').textContent=itens.filter(x=>!['finalizado','cancelado'].includes(x.status)).length;$('kpiFinalizados').textContent=itens.filter(x=>x.status==='finalizado').length;$('kpiReceita').textContent=moeda(itens.filter(x=>x.status==='finalizado').reduce((s,x)=>s+Number(x.valor||0),0))}
function renderTabela(itens){const body=$('agendaBody');if(!itens.length){body.innerHTML='<tr><td colspan="8" class="empty">Nenhum agendamento neste período.</td></tr>';return}body.innerHTML=itens.map(x=>{const [st,cl]=statusVisual(x);return `<tr><td data-label="Data">${esc(x.data?.split('-').reverse().join('/'))}</td><td data-label="Horário"><b>${esc(String(x.hora||'').slice(0,5))}</b></td><td data-label="Cliente"><strong>${esc(x.nome||'')}</strong></td><td data-label="WhatsApp">${esc(x.telefone||'')}</td><td data-label="Serviço">${esc(x.servico_nome||x.servico_id||'')}</td><td data-label="Valor">${moeda(x.valor)}</td><td data-label="Status"><span class="status ${cl}">${st}</span></td><td data-label="Ações"><div class="actions"><button class="btn gold" data-reagendar="${x.id}">Novo horário</button><button class="btn" data-edit="${x.id}">Editar dados</button><button class="btn danger" data-del="${x.id}">Excluir</button></div></td></tr>`}).join('');body.querySelectorAll('[data-reagendar]').forEach(b=>b.onclick=()=>{const x=itensAtuais.find(i=>i.id===b.dataset.reagendar);if(x)abrirNovo({nome:x.nome||'',telefone:telLimpo(x.telefone||'')})});body.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>abrirEdicao(b.dataset.edit));body.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>excluir(b.dataset.del))}
async function carregar(){try{$('statusAdmin').textContent='Atualizando...';let ini,fim,titulo;if(modo==='hoje'){ini=fim=hoje();titulo='Agenda do dia'}else if(modo==='semana'){[ini,fim]=periodoSemana();titulo='Agenda da semana'}else{ini=$('dataInicio').value;fim=$('dataFim').value;if(!ini||!fim||fim<ini)return;titulo='Agenda do período'}inicioAtual=ini;fimAtual=fim;let itens=await consultarPeriodo(ini,fim);if(await finalizarPassados(itens))itens=await consultarPeriodo(ini,fim);itensAtuais=itens;$('tituloAgenda').textContent=titulo;$('subtituloAgenda').textContent=ini===fim?ini.split('-').reverse().join('/'):`${ini.split('-').reverse().join('/')} a ${fim.split('-').reverse().join('/')}`;renderKPIs(itens);renderTabela(itens);$('statusAdmin').textContent=`Firebase conectado • ${itens.length} registro(s)`}catch(e){console.error(e);$('statusAdmin').textContent='Erro ao carregar agenda'}}
function setModo(novo){modo=novo;['fHoje','fSemana','fPersonalizado'].forEach(id=>$(id).classList.remove('active'));$(novo==='hoje'?'fHoje':novo==='semana'?'fSemana':'fPersonalizado').classList.add('active');$('rangePersonalizado').classList.toggle('hidden',novo!=='personalizado');if(novo!=='personalizado')carregar()}
function telLimpo(v){return String(v||'').replace(/\D/g,'').replace(/^55(?=\d{10,11}$)/,'')}
function minHora(h){const [a,b]=String(h||'00:00').slice(0,5).split(':').map(Number);return a*60+b}
function txtHora(m){return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`}
async function carregarBloqueios(data){try{const snap=await db.collection('bloqueios').where('data','==',data).get();return snap.docs.map(d=>({id:d.id,...d.data()}))}catch(e){console.warn('Bloqueios indisponíveis',e);return[]}}
async function bloquearHorario(){const data=$('bloqData').value,inicio=$('bloqInicio').value,fim=$('bloqFim').value,motivo=$('bloqMotivo').value.trim()||'Indisponível';if(!data||!inicio||!fim||fim<=inicio)return alert('Informe data, início e fim do bloqueio.');try{const id=`${data}_${inicio.replace(':','-')}_${fim.replace(':','-')}`;await db.collection('bloqueios').doc(id).set({data,inicio,fim,motivo,barbeiro_id:'leandro-david',criado_em:firebase.firestore.FieldValue.serverTimestamp()});await renderBloqueios();alert('Horário bloqueado para clientes.')}catch(e){console.error(e);alert('Não foi possível bloquear. Verifique as regras do Firebase.')}}
async function renderBloqueios(){const data=$('bloqData')?.value;if(!data)return;const itens=await carregarBloqueios(data),box=$('listaBloqueios');box.innerHTML=itens.length?itens.sort((a,b)=>a.inicio.localeCompare(b.inicio)).map(x=>`<div class="block-row"><span><b>${esc(x.inicio)}–${esc(x.fim)}</b> • ${esc(x.motivo)}</span><button class="btn danger" data-unblock="${x.id}">Liberar</button></div>`).join(''):'<div class="empty">Nenhum horário bloqueado neste dia.</div>';box.querySelectorAll('[data-unblock]').forEach(b=>b.onclick=async()=>{await db.collection('bloqueios').doc(b.dataset.unblock).delete();renderBloqueios()})}
async function liberarAlmoco(){const data=$('libData').value;if(!data)return alert('Escolha a data.');try{await db.collection('liberacoes').doc(data).set({data,periodos:[{inicio:'12:00',fim:'13:30'}],barbeiro_id:'leandro-david',atualizado_em:firebase.firestore.FieldValue.serverTimestamp()});alert('Almoço liberado excepcionalmente neste dia.')}catch(e){console.error(e);alert('Não foi possível liberar o almoço. Verifique as regras do Firebase.')}}
async function salvarHorarioEspecial(){const data=$('espData').value,inicio=$('espInicio').value,fim=$('espFim').value;if(!data||!inicio||!fim||fim<=inicio)return alert('Informe data, início e fim.');try{await db.collection('horarios_especiais').doc(data).set({data,inicio,fim,barbeiro_id:'leandro-david',atualizado_em:firebase.firestore.FieldValue.serverTimestamp()});alert('Horário especial salvo. Neste dia o app poderá oferecer horários até '+fim+'.')}catch(e){console.error(e);alert('Não foi possível salvar o horário especial. Verifique as regras do Firebase.')}}
function idCliente(tel){return 'tel_'+telLimpo(tel)}
async function carregarClientes(){
  const mapa=new Map();
  try{
    const snap=await db.collection('clientes').get();
    snap.docs.forEach(d=>{const x={id:d.id,...d.data()};const tel=telLimpo(x.telefone);if(tel)mapa.set(tel,{...x,telefone:tel})});
  }catch(e){console.warn('Coleção clientes ainda não disponível.',e)}
  try{
    const snap=await db.collection('agendamentos').get();
    snap.docs.forEach(d=>{const x=d.data();const tel=telLimpo(x.telefone);if(tel&&!mapa.has(tel))mapa.set(tel,{id:idCliente(tel),nome:x.nome||'Cliente',telefone:tel,origem:'histórico'})});
  }catch(e){console.warn('Não foi possível montar clientes pelo histórico.',e)}
  clientesAtuais=[...mapa.values()].sort((a,b)=>String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR'));
  preencherSelectClientes();
  renderClientes();
  return clientesAtuais;
}
function preencherSelectClientes(){
  const sel=$('clienteExistente');if(!sel)return;
  const atual=sel.value;
  sel.innerHTML='<option value="">Novo cliente / preencher abaixo</option>'+clientesAtuais.map(c=>`<option value="${esc(c.telefone)}">${esc(c.nome||'Cliente')} • ${esc(c.telefone)}</option>`).join('');
  if([...sel.options].some(o=>o.value===atual))sel.value=atual;
}
function selecionarClienteExistente(tel){
  const c=clientesAtuais.find(x=>telLimpo(x.telefone)===telLimpo(tel));
  if(!c)return;
  $('editNome').value=c.nome||'';
  $('editTelefone').value=c.telefone||'';
}
function renderClientes(){
  const box=$('listaClientes');if(!box)return;
  const q=String($('buscaCliente')?.value||'').toLowerCase().trim();
  const lista=clientesAtuais.filter(c=>!q||String(c.nome||'').toLowerCase().includes(q)||String(c.telefone||'').includes(q));
  $('totalClientes').textContent=`${lista.length} cliente(s)`;
  if(!lista.length){box.innerHTML='<div class="empty">Nenhum cliente encontrado.</div>';return}
  box.innerHTML=lista.map(c=>`<article class="client-row"><div><strong>${esc(c.nome||'Cliente')}</strong><span>${esc(c.telefone||'')}</span></div><div class="client-row-actions"><button class="btn" data-agendar-cliente="${esc(c.telefone)}">Agendar</button><button class="btn danger" data-excluir-cliente="${esc(c.telefone)}">Excluir cadastro</button></div></article>`).join('');
  box.querySelectorAll('[data-agendar-cliente]').forEach(b=>b.onclick=()=>{const c=clientesAtuais.find(x=>telLimpo(x.telefone)===telLimpo(b.dataset.agendarCliente));fecharClientes();abrirNovo(c)});
  box.querySelectorAll('[data-excluir-cliente]').forEach(b=>b.onclick=()=>excluirCliente(b.dataset.excluirCliente));
}
async function salvarCadastroCliente(){
  const nome=$('cadNome').value.trim(),telefone=telLimpo($('cadTelefone').value);
  if(!nome||telefone.length<10)return alert('Informe nome e WhatsApp do cliente.');
  try{
    await db.collection('clientes').doc(idCliente(telefone)).set({nome,telefone,atualizado_em:firebase.firestore.FieldValue.serverTimestamp(),criado_por:'admin'},{merge:true});
    $('cadNome').value='';$('cadTelefone').value='';
    await carregarClientes();
  }catch(e){console.error(e);alert('Não foi possível cadastrar o cliente. Verifique as regras do Firebase para a coleção clientes.')}
}
async function excluirCliente(tel){
  if(!confirm('Excluir apenas o cadastro deste cliente? Os agendamentos serão mantidos.'))return;
  try{await db.collection('clientes').doc(idCliente(tel)).delete();await carregarClientes()}catch(e){console.error(e);alert('Não foi possível excluir o cadastro.')}
}
function abrirClientes(){$('modalClientes').classList.remove('hidden');carregarClientes()}
function fecharClientes(){$('modalClientes').classList.add('hidden')}
function preencherServicos(){const sel=$('editServico');sel.innerHTML=servicos.map(s=>`<option value="${s.id}">${esc(s.nome)}</option>`).join('');sel.onchange=()=>{const s=servicos.find(x=>x.id===sel.value);if(s){$('editValor').value=s.valor;$('editDuracao').value=s.duracao}}}
function abrirNovo(cliente=null){preencherServicos();preencherSelectClientes();$('modalTitulo').textContent=cliente?'Agendar cliente cadastrado':'Cadastrar / agendar cliente';$('editId').value='';$('editNome').value=cliente?.nome||'';$('editTelefone').value=cliente?.telefone||'';$('clienteExistente').value=cliente?.telefone||'';$('editData').value=hoje();$('editHora').value='09:00';$('editStatus').value='pendente';if(servicos[0]){$('editServico').value=servicos[0].id;$('editValor').value=servicos[0].valor;$('editDuracao').value=servicos[0].duracao}$('btnExcluir').classList.add('hidden');$('modalAgendamento').classList.remove('hidden')}
function abrirEdicao(id){const x=itensAtuais.find(i=>i.id===id);if(!x)return;preencherServicos();$('modalTitulo').textContent='Editar agendamento';$('editId').value=id;$('editNome').value=x.nome||'';$('editTelefone').value=x.telefone||'';preencherSelectClientes();$('clienteExistente').value=telLimpo(x.telefone||'');$('editServico').value=x.servico_id||servicos[0]?.id||'';$('editData').value=x.data||hoje();$('editHora').value=String(x.hora||'').slice(0,5);$('editStatus').value=x.status||'pendente';$('editValor').value=Number(x.valor||0);$('editDuracao').value=Number(x.duracao_minutos||30);$('btnExcluir').classList.remove('hidden');$('modalAgendamento').classList.remove('hidden')}
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
    if(dados.telefone){
      await db.collection('clientes').doc(idCliente(dados.telefone)).set({nome:dados.nome,telefone:dados.telefone,atualizado_em:firebase.firestore.FieldValue.serverTimestamp(),criado_por:'admin'},{merge:true}).catch(e=>console.warn('Cadastro de cliente não salvo:',e));
    }
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
      if(duplicado){
        alert('Este cliente já possui um agendamento neste dia. Edite o agendamento existente em vez de criar outro.');
        return;
      }

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
async function qrPngBlobAdmin(){
  const svgTexto=await fetch('qr-cliente.svg?v=67',{cache:'no-store'}).then(r=>r.text());
  const svgBlob=new Blob([svgTexto],{type:'image/svg+xml'});
  const svgUrl=URL.createObjectURL(svgBlob);
  try{
    const img=new Image();
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=svgUrl});
    const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1200;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1200,1200);ctx.drawImage(img,0,0,1200,1200);
    return await new Promise(resolve=>canvas.toBlob(resolve,'image/png',1));
  }finally{URL.revokeObjectURL(svgUrl)}
}
async function compartilharQrAdmin(){
  const url='https://projetosetags.github.io/barbearia/';
  try{
    const blob=await qrPngBlobAdmin();
    const arquivo=new File([blob],'qr-barbearia-leandro-david.png',{type:'image/png'});
    if(navigator.share && (!navigator.canShare || navigator.canShare({files:[arquivo]}))){
      await navigator.share({title:'Barbearia Leandro David',text:'Escaneie o QR Code para agendar seu horário.',files:[arquivo],url});
    }else{
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='qr-barbearia-leandro-david.png';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);
      alert('QR Code salvo como imagem para você encaminhar.');
    }
  }catch(e){console.error(e);alert('Não foi possível compartilhar o QR Code agora.')}
}
async function baixarQrAdmin(){
  try{const blob=await qrPngBlobAdmin();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='qr-barbearia-leandro-david.png';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500)}catch(e){console.error(e);alert('Não foi possível gerar o QR Code agora.')}
}
async function copiarLinkAdmin(){
  const url='https://projetosetags.github.io/barbearia/';
  try{await navigator.clipboard.writeText(url);alert('Link do app copiado.')}catch(_){prompt('Copie o link do app:',url)}
}
async function excluir(id){if(!confirm('Excluir este agendamento?'))return;try{const batch=db.batch();batch.delete(db.collection('agendamentos').doc(id));batch.delete(db.collection('ocupacoes').doc(id));await batch.commit();fecharModal();await carregar()}catch(e){console.error(e);alert('Não foi possível excluir.')}}
window.addEventListener('DOMContentLoaded',()=>{if(!iniciar()){mensagem('Firebase não configurado.','erro');return}$('btnEntrar').onclick=async()=>{const email=emailDoUsuario($('email').value),senha=$('senha').value;if(!autorizado(email))return mensagem('Usuário sem acesso ao painel.','erro');try{await auth.signInWithEmailAndPassword(email,senha)}catch(e){console.error(e);mensagem('Usuário ou senha inválidos.','erro')}};$('btnSair').onclick=()=>auth.signOut();$('fHoje').onclick=()=>setModo('hoje');$('fSemana').onclick=()=>setModo('semana');$('fPersonalizado').onclick=()=>setModo('personalizado');$('btnAplicarPeriodo').onclick=carregar;$('btnAtualizar').onclick=carregar;$('btnNovo').onclick=()=>abrirNovo();$('btnBloqueios').onclick=()=>{$('modalDisponibilidade').classList.remove('hidden');$('bloqData').value=hoje();$('espData').value=hoje();renderBloqueios()};$('btnFecharDisponibilidade').onclick=()=>$('modalDisponibilidade').classList.add('hidden');$('bloqData').onchange=renderBloqueios;$('btnBloquear').onclick=bloquearHorario;$('btnHorarioEspecial').onclick=salvarHorarioEspecial;$('btnLiberarAlmoco').onclick=liberarAlmoco;$('btnClientes').onclick=abrirClientes;$('btnFecharClientes').onclick=fecharClientes;$('btnSalvarCliente').onclick=salvarCadastroCliente;$('buscaCliente').oninput=renderClientes;$('clienteExistente').onchange=e=>{if(e.target.value)selecionarClienteExistente(e.target.value)};$('btnNovoClienteModal').onclick=()=>{$('clienteExistente').value='';$('editNome').value='';$('editTelefone').value='';};$('btnCompartilharCliente').onclick=()=>$('modalQrAdmin').classList.remove('hidden');$('btnFecharQrAdmin').onclick=()=>$('modalQrAdmin').classList.add('hidden');$('modalQrAdmin').onclick=e=>{if(e.target.id==='modalQrAdmin')$('modalQrAdmin').classList.add('hidden')};$('btnCompartilharQrAdmin').onclick=compartilharQrAdmin;$('btnBaixarQrAdmin').onclick=baixarQrAdmin;$('btnCopiarLinkAdmin').onclick=copiarLinkAdmin;$('btnFecharModal').onclick=fecharModal;$('btnCancelarModal').onclick=fecharModal;$('btnSalvar').onclick=salvar;$('btnExcluir').onclick=()=>excluir($('editId').value);const [si,sf]=periodoSemana();$('dataInicio').value=si;$('dataFim').value=sf;auth.onAuthStateChanged(async user=>{if(user){if(!autorizado(user.email)){await auth.signOut();return}$('loginWrap').classList.add('hidden');$('painel').classList.remove('hidden');$('perfil').textContent=user.email.toLowerCase()===EMAIL_ADMIN?'Administrador Total':'Leandro';sincronizarOcupacoesExistentes().then(n=>{if(n>=0)console.log('Ocupações sincronizadas:',n)});carregarClientes();carregar();setInterval(carregar,60000)}else{$('painel').classList.add('hidden');$('loginWrap').classList.remove('hidden')}})});
})();