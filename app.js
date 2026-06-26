/*=========================================================
001 VARIÁVEIS GLOBAIS
=========================================================*/
let painelProprietario=false
let servicosCache=[]
let clientePersonalizadoAtual=[]
let clienteAdminAtualId=''
/*=========================================================
002 SAFE
=========================================================*/
function safe(id){
return document.getElementById(id)
}
/*=========================================================
003 DATA HOJE
=========================================================*/
function dataHoje(){
return new Date().toISOString().slice(0,10)
}
/*=========================================================
004 FORMATAR HORA
=========================================================*/
function formatarHora(h){
if(!h)return''
return String(h).slice(0,5)
}
/*=========================================================
004A FORMATAR DATA
=========================================================*/
function dataBR(d){
if(!d)return''
let s=String(d).slice(0,10)
if(!s.includes('-'))return s
let p=s.split('-')
return `${p[2]}-${p[1]}-${p[0]}`
}
/*=========================================================
004B FORMATAR MOEDA
=========================================================*/
function moeda(v){
return Number(v||0).toLocaleString('pt-BR',{
minimumFractionDigits:2,
maximumFractionDigits:2
})
}
/*=========================================================
004C FORMATAR TELEFONE BR
=========================================================*/
function telefoneBR(tel){
let n=String(tel||'').replace(/\D/g,'')
if(!n)return''
if(n.startsWith('55'))n=n.slice(2)
if(n.length===11)return`(${n.slice(0,2)}) ${n.slice(2,3)} ${n.slice(3,7)} ${n.slice(7)}`
if(n.length===10)return`(${n.slice(0,2)}) ${n.slice(2,6)} ${n.slice(6)}`
return tel
}
/*=========================================================
005 ALTERNAR PAINEL
=========================================================*/
function alternarPainel(){

if(!painelProprietario){

if(localStorage.getItem('barbearia_admin')!=='SIM'){
safe('loginAdmin').classList.remove('hidden')
return
}

painelProprietario=true

safe('viewCliente').classList.add('hidden')
safe('loginAdmin').classList.add('hidden')
safe('viewProprietario').classList.remove('hidden')

safe('btnPainel').innerText='App Cliente'

atualizarAdminPainel()
}else{

painelProprietario=false

safe('viewCliente').classList.remove('hidden')
safe('viewProprietario').classList.add('hidden')
safe('loginAdmin').classList.add('hidden')

window.scrollTo({
top:0,
behavior:'smooth'
})

return
}
}
/*=========================================================
006 CARREGAR SERVIÇOS
=========================================================*/
async function carregarServicos(){
let {data,error}=await client.from('servicos').select('*').eq('ativo',true).order('nome')
if(error)return alert('Erro ao carregar serviços')
servicosCache=data||[]
if(safe('servicoSelect')){
safe('servicoSelect').innerHTML=servicosCache.map(s=>`<option value="${s.id}">${s.nome} - ${s.duracao_minutos} min - R$ ${moeda(s.valor)}</option>`).join('')
}
}
/*=========================================================
007A CARREGAR BARBEIROS
=========================================================*/
async function carregarBarbeiros(){
let {data,error}=await client.from('barbeiros').select('*').eq('ativo',true).order('nome')
if(error)return
if(safe('barbeiroSelect')){
safe('barbeiroSelect').innerHTML=(data||[]).map(b=>`<option value="${b.id}">${b.nome}</option>`).join('')
}
}
/*=========================================================
007 SOLICITAR AGENDAMENTO
=========================================================*/
async function solicitarAgendamento(){
let barbeiro_id=safe('barbeiroSelect').value
let nome=safe('clienteNome').value.trim()
let telefone=safe('clienteTelefone').value.trim()
let servico_id=safe('servicoSelect').value
let data_agendamento=safe('dataAgendamento').value
let hora_solicitada=safe('horaSolicitada').value
if(!nome||!telefone||!servico_id||!data_agendamento||!hora_solicitada)return alert('Preencha todos os campos')
let {data:cli,error:erroCli}=await client.from('clientes').insert({nome,telefone}).select().single()
if(erroCli)return alert('Erro ao cadastrar cliente')
let servico=servicosCache.find(x=>x.id===servico_id)
let valor=Number(servico?.valor||0)

let {error}=await client.from('agendamentos').insert({
cliente_id:cli.id,
barbeiro_id,
servico_id,
data_agendamento,
hora_solicitada,
valor,
status:'aguardando'
})
if(error)return alert('Erro ao solicitar agendamento')
safe('retornoCliente').innerHTML='Solicitação enviada. Aguarde o aceite do salão.'
await gerarHorarios()
safe('telefoneBusca').value=telefone
acompanharCliente()
}
/*=========================================================
008 ACOMPANHAR CLIENTE
=========================================================*/
async function acompanharCliente(){
let telefone=safe('telefoneBusca').value.trim()
if(!telefone)return alert('Informe o WhatsApp')
let {data,error}=await client.from('agendamentos').select('*,clientes(nome,telefone),servicos(nome,duracao_minutos,valor),barbeiros(nome)').eq('clientes.telefone',telefone).in('status',['aguardando','aceito','confirmado','proximo','em_atendimento']).order('data_agendamento',{ascending:true}).order('hora_solicitada',{ascending:true})
if(error)return alert('Erro ao buscar agendamento')
let meus=data||[]
let meu=meus[0]
if(!meu){renderCliente([]);return}
let anterior=null
if(meu.barbeiro_id){
let {data:fila=[]}=await client.from('agendamentos').select('*,clientes(nome),servicos(nome,duracao_minutos),barbeiros(nome)').eq('data_agendamento',meu.data_agendamento).eq('barbeiro_id',meu.barbeiro_id).in('status',['aceito','confirmado','proximo','em_atendimento']).order('hora_prevista',{ascending:true}).order('hora_solicitada',{ascending:true})
let idx=fila.findIndex(x=>x.id===meu.id)
if(idx>0)anterior=fila[idx-1]
if(!anterior)anterior=fila.find(x=>x.status==='em_atendimento')||null
}
renderCliente([meu],anterior)
}
/*=========================================================
009 RENDER CLIENTE
=========================================================*/
function renderCliente(lista,anterior=null){
if(!lista.length){
safe('listaCliente').innerHTML='<div class="itemAgenda">Nenhum agendamento ativo encontrado.</div>'
return
}
safe('listaCliente').innerHTML=lista.map(a=>{
let tempo=calcularTextoTempo(a)
let ant=anterior?`<div class="itemAgenda"><h4>Atendimento anterior ao seu</h4><p>Cliente: ${anterior.clientes?.nome||''}</p><p>Serviço: ${anterior.servicos?.nome||''}</p><p>Status: <strong>${anterior.status}</strong></p><p>Horário: ${formatarHora(anterior.hora_prevista||anterior.hora_solicitada)}</p></div>`:''
return `<div class="itemAgenda"><h4>${a.servicos?.nome||''}</h4><p>Cliente: ${a.clientes?.nome||''}</p><p>Data: ${dataBR(a.data_agendamento)}</p><p>Horário solicitado: ${formatarHora(a.hora_solicitada)}</p><p>Horário previsto: ${formatarHora(a.hora_prevista)||'aguardando aceite'}</p><p>Status: <strong>${a.status}</strong></p><p>${tempo}</p></div>${ant}`
}).join('')
}
/*=========================================================
010 CALCULAR TEXTO TEMPO
=========================================================*/
function calcularTextoTempo(a){
if(a.status==='aguardando')return'Aguardando confirmação do salão.'
if(a.status==='recusado')return'Agendamento recusado pelo salão.'
if(a.status==='finalizado')return'Atendimento finalizado.'
if(a.status==='em_atendimento')return'Você está em atendimento.'
if(!a.hora_prevista)return'Horário previsto ainda não calculado.'
let agora=new Date()
let alvo=new Date(`${dataBR(a.data_agendamento)}T${formatarHora(a.hora_prevista)}:00`)
let min=Math.round((alvo-agora)/60000)
if(min>0)return`Faltam aproximadamente ${min} minutos para seu atendimento.`
if(min>-20)return'Seu horário está chegando. Dirija-se ao salão.'
return'O horário previsto já passou. Consulte o salão.'
}
/*=========================================================
011 CARREGAR PAINEL
=========================================================*/
async function carregarPainel(){
let data=safe('dataPainel').value||dataHoje()
safe('dataPainel').value=data
let {data:lista,error}=await client.from('agendamentos').select('*,clientes(nome,telefone),servicos(nome,duracao_minutos,valor)').eq('data_agendamento',data).order('hora_solicitada',{ascending:true})
if(error)return alert('Erro ao carregar painel')
renderPainel(lista||[])
carregarAgendaSemanal()
carregarRecepcao()
carregarCaixa()
carregarReceitaBarbeiros()
await carregarDashboard()
}
/*=========================================================
012 RENDER PAINEL
=========================================================*/
function renderPainel(lista){
safe('kpiAguardando').innerText=lista.filter(a=>a.status==='aguardando').length
safe('kpiAceitos').innerText=lista.filter(a=>a.status==='aceito'||a.status==='confirmado'||a.status==='proximo').length
safe('kpiAtendimento').innerText=lista.filter(a=>a.status==='em_atendimento').length
safe('kpiFinalizados').innerText=lista.filter(a=>a.status==='finalizado').length
let dataSelecionada=dataBR(safe('dataPainel').value||dataHoje())
if(!lista.length){
safe('listaPainel').innerHTML=`<div class="tituloAgendaDia">AGENDAMENTOS DO DIA ${dataSelecionada}</div><div class="itemAgenda">Nenhum agendamento para esta data.</div>`
return
}
safe('listaPainel').innerHTML=`<div class="tituloAgendaDia">AGENDAMENTOS DO DIA ${dataSelecionada}</div>`+lista.map(a=>`<div class="itemAgenda"><h4>${formatarHora(a.hora_solicitada)} - ${a.clientes?.nome||''}</h4><p>WhatsApp: ${a.clientes?.telefone||''}</p><p>Serviço: ${a.servicos?.nome||''} - ${a.servicos?.duracao_minutos||0} min</p><p>Status: <strong>${a.status}</strong></p><p>Horário previsto: ${formatarHora(a.hora_prevista)||'não definido'}</p><div class="botoes">${botoesPainel(a)}</div></div>`).join('')
}
/*=========================================================
013 BOTÕES PAINEL
=========================================================*/
function botoesPainel(a){
let html=''
if(a.status==='aguardando')html+=`<button class="btnAceitar" onclick="aceitarAgendamento('${a.id}')">Aceitar</button><button class="btnRecusar" onclick="alterarStatus('${a.id}','recusado')">Recusar</button>`
if(a.status==='aceito'||a.status==='confirmado'||a.status==='proximo')html+=`<button class="btnAtender" onclick="alterarStatus('${a.id}','em_atendimento')">Iniciar</button>`
if(a.status==='em_atendimento')html+=`<button class="btnFinalizar" onclick="alterarStatus('${a.id}','finalizado')">Finalizar</button>`
html+=`<button class="btnAtender" onclick="whatsappCliente('${a.id}')">WhatsApp</button>`
return html
}
/*=========================================================
014 ACEITAR AGENDAMENTO
=========================================================*/
async function aceitarAgendamento(id){
let data=safe('dataPainel').value||dataHoje()
let {data:lista,error}=await client.from('agendamentos').select('*,servicos(duracao_minutos)').eq('data_agendamento',data).in('status',['aceito','confirmado','proximo','em_atendimento']).order('hora_prevista',{ascending:true})
if(error)return alert('Erro ao calcular fila')
let ag=await buscarAgendamento(id)
let hora=calcularProximaHora(lista||[],ag)
let {error:erro}=await client.from('agendamentos').update({status:'aceito',hora_prevista:hora}).eq('id',id)
if(erro)return alert('Erro ao aceitar')
carregarPainel()
}
/*=========================================================
015 BUSCAR AGENDAMENTO
=========================================================*/
async function buscarAgendamento(id){
let {data,error}=await client.from('agendamentos').select('*,servicos(duracao_minutos)').eq('id',id).single()
if(error)return null
return data
}
/*=========================================================
016 CALCULAR PRÓXIMA HORA
=========================================================*/
function calcularProximaHora(lista,ag){
if(!lista.length)return formatarHora(ag.hora_solicitada)
let ultimo=lista[lista.length-1]
let base=new Date(`${ultimo.data_agendamento}T${formatarHora(ultimo.hora_prevista||ultimo.hora_solicitada)}:00`)
let duracao=ultimo.servicos?.duracao_minutos||30
base.setMinutes(base.getMinutes()+duracao)
return base.toTimeString().slice(0,5)
}
/*=========================================================
017 ALTERAR STATUS
=========================================================*/
async function alterarStatus(id,status){
let {error}=await client.from('agendamentos').update({status}).eq('id',id)
if(error)return alert('Erro ao alterar status')
if(status==='finalizado'){
let ag=await buscarAgendamento(id)
if(ag){
let valor=Number(ag.valor||0)
let comissao=valor*0.5
await client.from('comissoes').insert({
barbeiro_id:ag.barbeiro_id,
agendamento_id:ag.id,
percentual:50,
valor:comissao
})
}
await client.rpc('incrementar_atendimento_cliente',{p_cliente_id:ag.cliente_id})
}
carregarPainel()
carregarRecepcao()
carregarCaixa()
carregarReceitaBarbeiros()
}
/*=========================================================
018 INICIAR SISTEMA
=========================================================*/
window.addEventListener('load',async()=>{
if(safe('dataAgendamento'))safe('dataAgendamento').value=dataHoje()
if(safe('dataPainel'))safe('dataPainel').value=dataHoje()
if(safe('servicoSelect'))await carregarServicos()
if(safe('barbeiroSelect'))await carregarBarbeiros()
if(safe('horaSolicitada'))await gerarHorarios()
if(safe('dataAgendamento'))safe('dataAgendamento').addEventListener('change',gerarHorarios)
if(safe('barbeiroSelect'))safe('barbeiroSelect').addEventListener('change',gerarHorarios)
if(typeof protegerAdmin==='function')await protegerAdmin()
setInterval(()=>{if(safe('recepcaoFila'))carregarRecepcao()},10000)
setInterval(()=>{if(safe('listaPainel'))carregarPainel()},30000)
})
/*=========================================================
019 GERAR HORARIOS
=========================================================*/
async function gerarHorarios(){
let data=safe('dataAgendamento').value||dataHoje()
let barbeiro_id=safe('barbeiroSelect')?.value||''
let {data:agenda=[]}=await client.from('agendamentos').select('hora_solicitada,status,barbeiro_id').eq('data_agendamento',data).eq('barbeiro_id',barbeiro_id).neq('status','cancelado')
let ocupados=agenda.map(a=>String(a.hora_solicitada).slice(0,5))
let html=''
for(let h=8;h<=20;h++){
if(h===8){
let hora='08:30'
if(!ocupados.includes(hora))html+=`<option value="${hora}">${hora}</option>`
continue
}
if(h<20){
let h1=`${String(h).padStart(2,'0')}:00`
let h2=`${String(h).padStart(2,'0')}:30`
if(!ocupados.includes(h1))html+=`<option value="${h1}">${h1}</option>`
if(!ocupados.includes(h2))html+=`<option value="${h2}">${h2}</option>`
}else{
let hora='20:00'
if(!ocupados.includes(hora))html+=`<option value="${hora}">${hora}</option>`
}
}
safe('horaSolicitada').innerHTML=html
}
/*=========================================================
020 LOGIN ADMIN
=========================================================*/
async function entrarAdmin(){
let login=safe('loginUsuario').value.trim()
let senha=safe('senhaUsuario').value.trim()

let {data,error}=await client
.from('usuarios')
.select('*')
.eq('login',login)
.eq('senha',senha)
.maybeSingle()

if(error){
console.error(error)
alert('Erro no login')
return
}

if(!data){
alert('Login inválido')
return
}

localStorage.setItem('barbearia_admin','SIM')

painelProprietario=true

safe('loginAdmin').classList.add('hidden')
safe('viewCliente').classList.add('hidden')
safe('viewProprietario').classList.remove('hidden')

safe('btnPainel').innerText='App Cliente'

await atualizarAdminPainel()
}
/*=========================================================
021 AGENDA SEMANAL
=========================================================*/
async function carregarAgendaSemanal(){
let dataBase=safe('dataPainel')?.value||dataHoje()
let base=new Date(dataBase+'T00:00:00')
let inicio=new Date(base)
inicio.setDate(base.getDate()-base.getDay())
let fim=new Date(inicio)
fim.setDate(inicio.getDate()+6)
let dataInicio=inicio.toISOString().slice(0,10)
let dataFim=fim.toISOString().slice(0,10)
let {data=[],error}=await client
.from('agendamentos')
.select('id,cliente_id,servico_id,barbeiro_id,data_agendamento,hora_solicitada,hora_prevista,status,valor,compareceu,cor_agenda,clientes(nome,telefone),servicos(nome,duracao_minutos,valor),barbeiros(nome)')
.gte('data_agendamento',dataInicio)
.lte('data_agendamento',dataFim)
.order('data_agendamento')
.order('hora_solicitada')
if(error){
console.error(error)
alert('Erro ao carregar agenda semanal')
return
}
renderCalendarioSemanal(data,inicio)
}
/*=========================================================
022 RENDER CALENDARIO SEMANAL
=========================================================*/
function renderCalendarioSemanal(lista,inicioParam=null){
let dias=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
let inicio=inicioParam||new Date()
let html='<div class="calendarioSemana">'
html+='<div class="calDia">Hora</div>'
for(let d=0;d<7;d++){
let base=new Date(inicio)
base.setDate(inicio.getDate()+d)
let dt=String(base.getDate()).padStart(2,'0')+'-'+String(base.getMonth()+1).padStart(2,'0')
html+=`<div class="calDia"><strong>${dias[d]}</strong><br><small>${dt}</small></div>`
}
for(let h=8;h<=20;h++){
let horarios=[]
if(h===8)horarios.push('08:30')
else if(h===20)horarios.push('20:00')
else{
horarios.push(`${String(h).padStart(2,'0')}:00`)
horarios.push(`${String(h).padStart(2,'0')}:30`)
}
for(let horario of horarios){
html+=`<div class="calHora">${horario}</div>`
for(let d=0;d<7;d++){
let base=new Date(inicio)
base.setDate(inicio.getDate()+d)
let data=base.toISOString().slice(0,10)
let evento=lista.find(x=>x.data_agendamento===data&&String(x.hora_solicitada).slice(0,5)===horario)
let nomeEvento=evento?.clientes?.nome||''
nomeEvento=nomeEvento.replace(/CLIENTE DESTAQUE\s*[-–]?\s*/gi,'').trim()
let corEvento=corAgendaEvento(evento)
let clienteId=evento?.cliente_id||''
html+=`<div class="calCelula">${evento?`<button type="button" class="calEvento" style="background-color:${corEvento}!important;border-color:${corEvento}!important;color:#fff!important" onclick="abrirClientePersonalizado('${clienteId}')"><strong>${nomeEvento}</strong></button>`:''}</div>`
}
}
}
html+='</div>'
safe('calendarioSemanal').innerHTML=html
}
/*=========================================================
022A GARANTIR PAINEL CLIENTE PERSONALIZADO
=========================================================*/
function garantirPainelClientePersonalizado(){
if(safe('painelClientePersonalizado'))return
let div=document.createElement('div')
div.id='painelClientePersonalizado'
div.className='painelClientePersonalizado hidden'
div.innerHTML=`<div class="clientePersonalizadoBox"><div class="clientePersonalizadoTopo"><div><h2>Cliente Personalizado</h2><p id="clientePersonalizadoSub">Histórico completo do cliente</p></div><div class="botoesClientePersonalizado"><button onclick="gerarPDFClientePersonalizado()">Imprimir PDF</button><button onclick="fecharClientePersonalizado()">Fechar</button></div></div><div id="clientePersonalizadoConteudo"></div></div>`
document.body.appendChild(div)
}
/*=========================================================
022B ABRIR CLIENTE PERSONALIZADO
=========================================================*/
async function abrirClientePersonalizado(cliente_id){
if(!cliente_id)return
garantirPainelClientePersonalizado()
safe('painelClientePersonalizado').classList.remove('hidden')
safe('clientePersonalizadoConteudo').innerHTML='<div class="itemAgenda">Carregando histórico do cliente...</div>'
let {data=[],error}=await client
.from('agendamentos')
.select('*,clientes(nome,telefone,foto_url,cpf,nascimento,endereco,observacao),servicos(nome,duracao_minutos,valor),barbeiros(nome)')
.eq('cliente_id',cliente_id)
.order('data_agendamento',{ascending:false})
.order('hora_solicitada',{ascending:false})
if(error){
console.error(error)
safe('clientePersonalizadoConteudo').innerHTML='<div class="itemAgenda">Erro ao carregar histórico do cliente.</div>'
return
}
renderClientePersonalizado(data||[])
}
/*=========================================================
022C RENDER CLIENTE PERSONALIZADO
=========================================================*/
function renderClientePersonalizado(lista){
clientePersonalizadoAtual=lista||[]
if(!lista.length){
safe('clientePersonalizadoConteudo').innerHTML='<div class="itemAgenda">Nenhum atendimento encontrado para este cliente.</div>'
return
}
let cliente=lista[0].clientes||{}
let nome=cliente.nome||'Cliente'
let telefone=telefoneBR(cliente.telefone||'')
let foto=cliente.foto_url||''
let cpf=cliente.cpf||''
let nascimento=cliente.nascimento?dataBR(cliente.nascimento):''
let endereco=cliente.endereco||''
let observacao=cliente.observacao||''
let finalizados=lista.filter(x=>x.status==='finalizado')
let ativos=lista.filter(x=>['aguardando','aceito','confirmado','proximo','em_atendimento'].includes(x.status))
let cancelados=lista.filter(x=>['cancelado','recusado','desistente'].includes(x.status)||x.compareceu===false)
let totalGasto=finalizados.reduce((t,x)=>t+Number(x.valor||0),0)
let ticketMedio=finalizados.length?totalGasto/finalizados.length:0
let ultimo=lista[0]
safe('clientePersonalizadoSub').innerText=`${nome}${telefone?' | '+telefone:''}`
let html=''
html+='<div class="itemAgenda">'
html+='<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">'
if(foto){
html+=`<img src="${foto}" style="width:120px;height:120px;border-radius:50%;object-fit:cover;border:4px solid #0f172a">`
}else{
html+=`<div style="width:120px;height:120px;border-radius:50%;background:#e5e7eb;display:flex;align-items:center;justify-content:center;border:4px solid #0f172a;font-weight:900;color:#64748b">SEM FOTO</div>`
}
html+='<div>'
html+=`<h4>Cliente Personalizado</h4>`
html+=`<p><strong>Nome completo:</strong> ${nome}</p>`
html+=`<p><strong>Telefone:</strong> ${telefone||'-'}</p>`
if(cpf)html+=`<p><strong>CPF:</strong> ${cpf}</p>`
if(nascimento)html+=`<p><strong>Nascimento:</strong> ${nascimento}</p>`
if(endereco)html+=`<p><strong>Endereço:</strong> ${endereco}</p>`
if(observacao)html+=`<p><strong>Observação:</strong> ${observacao}</p>`
html+='</div>'
html+='</div>'
html+='</div>'
html+='<div class="cardsClientePersonalizado">'
html+=cardClientePersonalizado('Total de Registros',lista.length)
html+=cardClientePersonalizado('Concluídos',finalizados.length)
html+=cardClientePersonalizado('Agendados/Ativos',ativos.length)
html+=cardClientePersonalizado('Cancelados/Desistências',cancelados.length)
html+=cardClientePersonalizado('Total Gasto','R$ '+moeda(totalGasto))
html+=cardClientePersonalizado('Ticket Médio','R$ '+moeda(ticketMedio))
html+='</div>'
html+='<div class="itemAgenda">'
html+=`<h4>Resumo de Atendimento</h4>`
html+=`<p><strong>Último registro:</strong> ${dataBR(ultimo.data_agendamento)} às ${formatarHora(ultimo.hora_solicitada)}</p>`
html+=`<p><strong>Último serviço:</strong> ${ultimo.servicos?.nome||'-'}</p>`
html+=`<p><strong>Último barbeiro:</strong> ${ultimo.barbeiros?.nome||'-'}</p>`
html+=`<p><strong>Última situação:</strong> ${textoStatusClientePersonalizado(ultimo)}</p>`
html+='</div>'
html+=tabelaClientePersonalizado('TRABALHOS CONCLUÍDOS',finalizados)
html+=tabelaClientePersonalizado('AGENDADOS / EM ATENDIMENTO / AGUARDANDO',ativos)
html+=tabelaClientePersonalizado('CANCELADOS / RECUSADOS / DESISTÊNCIAS / NÃO COMPARECEU',cancelados)
let demais=lista.filter(x=>!finalizados.includes(x)&&!ativos.includes(x)&&!cancelados.includes(x))
if(demais.length)html+=tabelaClientePersonalizado('DEMAIS SITUAÇÕES',demais)
safe('clientePersonalizadoConteudo').innerHTML=html
}
/*=========================================================
022D CARD CLIENTE PERSONALIZADO
=========================================================*/
function cardClientePersonalizado(titulo,valor){
return `<div class="cardClientePersonalizado"><strong>${valor}</strong><span>${titulo}</span></div>`
}
/*=========================================================
022E TABELA CLIENTE PERSONALIZADO
=========================================================*/
function tabelaClientePersonalizado(titulo,lista){
let html=`<div class="blocoClientePersonalizado"><h3>${titulo}</h3>`
if(!lista.length){
html+='<div class="itemAgenda">Nenhum registro.</div></div>'
return html
}
html+='<div class="tabelaClientePersonalizado">'
html+='<div class="th">Data</div><div class="th">Hora</div><div class="th">Serviço</div><div class="th">Barbeiro</div><div class="th">Situação</div><div class="th">Valor</div>'
lista.forEach(a=>{
html+=`<div>${dataBR(a.data_agendamento)}</div>`
html+=`<div>${formatarHora(a.hora_solicitada)}</div>`
html+=`<div>${a.servicos?.nome||'-'}</div>`
html+=`<div>${a.barbeiros?.nome||'-'}</div>`
html+=`<div>${textoStatusClientePersonalizado(a)}</div>`
html+=`<div>R$ ${moeda(a.valor)}</div>`
})
html+='</div></div>'
return html
}
/*=========================================================
022F STATUS CLIENTE PERSONALIZADO
=========================================================*/
function textoStatusClientePersonalizado(a){
if(a.compareceu===false)return'Não compareceu'
if(a.status==='em_atendimento')return'Em atendimento'
if(a.status==='finalizado')return'Finalizado'
if(a.status==='aguardando')return'Aguardando'
if(a.status==='aceito')return'Aceito'
if(a.status==='confirmado')return'Confirmado'
if(a.status==='proximo')return'Próximo'
if(a.status==='cancelado')return'Cancelado'
if(a.status==='recusado')return'Recusado'
if(a.status==='desistente')return'Desistente'
return a.status||'-'
}
/*=========================================================
022G FECHAR CLIENTE PERSONALIZADO
=========================================================*/
function fecharClientePersonalizado(){
if(safe('painelClientePersonalizado'))safe('painelClientePersonalizado').classList.add('hidden')
}
/*=========================================================
022H GERAR PDF CLIENTE PERSONALIZADO
=========================================================*/
async function gerarPDFClientePersonalizado(){
let lista=clientePersonalizadoAtual||[]
if(!lista.length)return alert('Nenhum cliente selecionado para gerar PDF.')
const {jsPDF}=window.jspdf
let doc=new jsPDF('p','mm','a4')
let {data:cfg}=await client.from('configuracoes').select('*').limit(1).maybeSingle()
let cliente=lista[0].clientes||{}
let nome=cliente.nome||'Cliente'
let telefone=telefoneBR(cliente.telefone||'')
let cpf=cliente.cpf||''
let nascimento=cliente.nascimento?dataBR(cliente.nascimento):''
let endereco=cliente.endereco||''
let observacao=cliente.observacao||''
let finalizados=lista.filter(x=>x.status==='finalizado')
let ativos=lista.filter(x=>['aguardando','aceito','confirmado','proximo','em_atendimento'].includes(x.status))
let cancelados=lista.filter(x=>['cancelado','recusado','desistente'].includes(x.status)||x.compareceu===false)
let totalGasto=finalizados.reduce((t,x)=>t+Number(x.valor||0),0)
let ticketMedio=finalizados.length?totalGasto/finalizados.length:0
let nomeSalao=cfg?.nome_salao||'BARBEARIA LEANDRO DAVID'
let telefoneSalao=telefoneBR(cfg?.telefone||'')
let enderecoSalao=cfg?.endereco||''
let instagram=cfg?.instagram||''
let logo=await carregarLogoRelatorio()
let fotoCliente=await carregarImagemURL(cliente.foto_url)
doc.setFillColor(8,15,35)
doc.rect(0,0,210,38,'F')
if(logo)doc.addImage(logo,'PNG',10,7,24,24)
doc.setTextColor(255,255,255)
doc.setFontSize(16)
doc.setFont(undefined,'bold')
doc.text(nomeSalao,logo?38:10,13)
doc.setFontSize(9)
doc.setFont(undefined,'normal')
doc.text(`Telefone: ${telefoneSalao||'-'}`,logo?38:10,20)
doc.text(`Endereço: ${enderecoSalao||'-'}`,logo?38:10,26,{maxWidth:155})
if(instagram)doc.text(`Instagram: ${instagram}`,logo?38:10,32)
let y=46
doc.setTextColor(8,15,35)
doc.setFontSize(13)
doc.setFont(undefined,'bold')
doc.text('CLIENTE PERSONALIZADO',10,y)
y+=6
doc.setFillColor(245,247,250)
doc.roundedRect(10,y,190,34,2,2,'F')
doc.setDrawColor(210,220,235)
doc.roundedRect(10,y,190,34,2,2,'S')
if(fotoCliente){
doc.addImage(fotoCliente,'JPEG',14,y+5,24,24)
}
doc.setTextColor(8,15,35)
doc.setFontSize(10)
doc.setFont(undefined,'bold')
doc.text('DADOS DO CLIENTE',fotoCliente?44:14,y+8)
doc.setFont(undefined,'normal')
doc.setFontSize(9)
doc.text(`Nome completo: ${nome}`,fotoCliente?44:14,y+15)
doc.text(`Telefone: ${telefone||'-'}`,fotoCliente?44:14,y+21)
let linhaExtra=[]
if(cpf)linhaExtra.push(`CPF: ${cpf}`)
if(nascimento)linhaExtra.push(`Nascimento: ${nascimento}`)
if(endereco)linhaExtra.push(`Endereço: ${endereco}`)
doc.text(linhaExtra.join(' | ')||'Demais dados: não informados',fotoCliente?44:14,y+27,{maxWidth:150})
y+=42
y=cardsResumoRelatorio(doc,y,[
['Registros',lista.length],
['Concluídos',finalizados.length],
['Ativos',ativos.length],
['Cancelados',cancelados.length],
['Total Gasto','R$ '+moeda(totalGasto)]
])
y+=6
if(observacao){
doc.setFillColor(255,248,230)
doc.roundedRect(10,y,190,13,2,2,'F')
doc.setTextColor(120,75,0)
doc.setFontSize(8)
doc.setFont(undefined,'bold')
doc.text('Observação:',13,y+5)
doc.setFont(undefined,'normal')
doc.text(observacao,34,y+5,{maxWidth:160})
y+=18
}
y=tabelaRelatorioCliente(doc,y,'TRABALHOS CONCLUÍDOS',finalizados,true)
y=tabelaRelatorioCliente(doc,y,'AGENDADOS / ATIVOS',ativos,false)
y=tabelaRelatorioCliente(doc,y,'CANCELADOS / DESISTÊNCIAS / NÃO COMPARECEU',cancelados,false)
let demais=lista.filter(x=>!finalizados.includes(x)&&!ativos.includes(x)&&!cancelados.includes(x))
if(demais.length)y=tabelaRelatorioCliente(doc,y,'DEMAIS SITUAÇÕES',demais,false)
if(y>250){doc.addPage();y=15}
doc.setFillColor(8,15,35)
doc.rect(10,y,190,12,'F')
doc.setTextColor(255,255,255)
doc.setFontSize(10)
doc.setFont(undefined,'bold')
doc.text(`TOTAL GASTO: R$ ${moeda(totalGasto)} | TICKET MÉDIO: R$ ${moeda(ticketMedio)}`,14,y+8)
doc.setTextColor(0,0,0)
doc.setFontSize(8)
doc.setFont(undefined,'normal')
doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`,10,287)
doc.text(nomeSalao,150,287)
let nomeArquivo=nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
doc.save(`cliente-personalizado-${nomeArquivo||'cliente'}.pdf`)
}
/*=========================================================
022I TABELA PDF CLIENTE PERSONALIZADO
=========================================================*/
function tabelaRelatorioCliente(doc,y,titulo,lista,mostrarTotal){
if(y>245){doc.addPage();y=15}
doc.setFillColor(8,15,35)
doc.rect(10,y,190,9,'F')
doc.setTextColor(255,255,255)
doc.setFontSize(10)
doc.setFont(undefined,'bold')
doc.text(titulo,12,y+6)
y+=11
if(!lista.length){
doc.setTextColor(90,90,90)
doc.setFontSize(9)
doc.setFont(undefined,'normal')
doc.text('Nenhum registro encontrado.',12,y+5)
return y+12
}
let colunas=[
{t:'Data',x:10,w:24},
{t:'Hora',x:34,w:18},
{t:'Serviço',x:52,w:45},
{t:'Barbeiro',x:97,w:38},
{t:'Situação',x:135,w:35},
{t:'Valor',x:170,w:30}
]
doc.setFillColor(225,232,242)
doc.rect(10,y,190,8,'F')
doc.setTextColor(8,15,35)
doc.setFontSize(8)
doc.setFont(undefined,'bold')
colunas.forEach(c=>doc.text(c.t,c.x+1,y+5))
y+=8
doc.setFont(undefined,'normal')
lista.forEach((a,i)=>{
if(y>275){doc.addPage();y=15}
let cor=i%2===0?250:242
doc.setFillColor(cor,cor,cor)
doc.rect(10,y,190,8,'F')
doc.setTextColor(0,0,0)
doc.setFontSize(7)
let linha=[
dataBR(a.data_agendamento),
formatarHora(a.hora_solicitada),
a.servicos?.nome||'-',
a.barbeiros?.nome||'-',
textoStatusClientePersonalizado(a),
'R$ '+moeda(a.valor)
]
colunas.forEach((c,idx)=>{
let txt=String(linha[idx]||'')
doc.text(txt,c.x+1,y+5,{maxWidth:c.w-2})
})
y+=8
})
if(mostrarTotal){
let total=lista.reduce((t,a)=>t+Number(a.valor||0),0)
doc.setFillColor(235,247,238)
doc.rect(10,y,190,8,'F')
doc.setTextColor(8,80,35)
doc.setFontSize(8)
doc.setFont(undefined,'bold')
doc.text(`Subtotal concluído: R$ ${moeda(total)}`,12,y+5)
y+=10
}
return y+5
}
/*=========================================================
022J CARREGAR IMAGEM POR URL
=========================================================*/
async function carregarImagemURL(url){
try{
if(!url)return null
let r=await fetch(url)
if(!r.ok)return null
let blob=await r.blob()
return await blobParaDataURL(blob)
}catch(e){
return null
}
}
/*=========================================================
022K COR AGENDA EVENTO
=========================================================*/
function corAgendaEvento(evento){
if(!evento)return'#2563eb'
if(evento.cor_agenda)return evento.cor_agenda
if(evento.status==='aguardando')return'#f59e0b'
if(evento.status==='aceito')return'#2563eb'
if(evento.status==='confirmado')return'#16a34a'
if(evento.status==='proximo')return'#7c3aed'
if(evento.status==='em_atendimento')return'#dc2626'
if(evento.status==='finalizado')return'#0f766e'
if(evento.status==='cancelado'||evento.status==='recusado'||evento.status==='desistente')return'#64748b'
return'#2563eb'
}
/*=========================================================
023 RECEPCAO
=========================================================*/
async function carregarRecepcao(){
let hoje=dataHoje()
let {data=[]}=await client.from('agendamentos').select('*,clientes(nome),servicos(duracao_minutos)').eq('data_agendamento',hoje).order('hora_solicitada')
let atendimento=data.find(x=>x.status==='em_atendimento')
let proximo=data.find(x=>x.status==='aceito'||x.status==='confirmado'||x.status==='proximo')
let fila=data.filter(x=>x.status==='aceito'||x.status==='confirmado'||x.status==='proximo').length
let tempo=0
data.filter(x=>x.status==='aceito'||x.status==='confirmado'||x.status==='proximo').forEach(x=>tempo+=Number(x.servicos?.duracao_minutos||0))
safe('recepcaoAtendimento').innerText=atendimento?.clientes?.nome||'-'
safe('recepcaoProximo').innerText=proximo?.clientes?.nome||'-'
safe('recepcaoFila').innerText=fila
safe('recepcaoTempo').innerText=tempo
}
/*=========================================================
024 CARREGAR CAIXA
=========================================================*/
async function carregarCaixa(){
let hoje=dataHoje()
let inicioMes=hoje.substring(0,7)+'-01'
let {data:dia=[]}=await client.from('agendamentos').select('valor,status').eq('data_agendamento',hoje).eq('status','finalizado')
let {data:mes=[]}=await client.from('agendamentos').select('valor,status').gte('data_agendamento',inicioMes).eq('status','finalizado')
let receitaDia=dia.reduce((t,x)=>t+Number(x.valor||0),0)
let receitaMes=mes.reduce((t,x)=>t+Number(x.valor||0),0)
let ticket=dia.length?(receitaDia/dia.length):0
safe('receitaDia').innerText='R$ '+moeda(receitaDia)
safe('receitaMes').innerText='R$ '+moeda(receitaMes)
safe('ticketMedio').innerText='R$ '+moeda(ticket)
safe('clientesDia').innerText=dia.length
}
/*=========================================================
025 RECEITA BARBEIROS
=========================================================*/
async function carregarReceitaBarbeiros(){
let inicioMes=dataHoje().substring(0,7)+'-01'
let {data=[]}=await client
.from('agendamentos')
.select('valor,barbeiro_id,barbeiros(nome)')
.gte('data_agendamento',inicioMes)
.eq('status','finalizado')

let mapa={}

data.forEach(x=>{
let nome=x.barbeiros?.nome||'Sem Nome'
if(!mapa[nome])mapa[nome]=0
mapa[nome]+=Number(x.valor||0)
})

safe('painelBarbeiros').innerHTML=Object.entries(mapa)
.sort((a,b)=>b[1]-a[1])
.map(x=>`<div class="itemAgenda"><strong>${x[0]}</strong><br>Receita: R$ ${moeda(x[1])}</div>`)
.join('')
}
/*=========================================================
026 WHATSAPP AGENDAMENTO
=========================================================*/
function abrirWhatsapp(numero,msg){
let tel=String(numero||'').replace(/\D/g,'')
if(!tel.startsWith('55'))tel='55'+tel
window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`,'_blank')
}
/*=========================================================
027 WHATSAPP CLIENTE
=========================================================*/
async function whatsappCliente(id){
let {data:a,error}=await client.from('agendamentos').select('*,clientes(nome,telefone),servicos(nome),barbeiros(nome)').eq('id',id).single()
let {data:cfg}=await client
.from('configuracoes')
.select('*')
.limit(1)
.single()
if(error||!a)return alert('Erro ao buscar agendamento')
let msg=`Olá ${a.clientes?.nome}!
Seu horário foi confirmado.
Barbearia Leandro David
Serviço: ${a.servicos?.nome}
Barbeiro: ${a.barbeiros?.nome}
Data: ${dataBR(a.data_agendamento)}
Horário: ${formatarHora(a.hora_prevista||a.hora_solicitada)}
Endereço:
${cfg.endereco}
Esperamos você!`
abrirWhatsapp(a.clientes?.telefone,msg)
}
/*=========================================================
028 GEOLOCALIZACAO CLIENTE
=========================================================*/
async function obterLocalizacaoCliente(){
if(!navigator.geolocation)return alert('Geolocalização indisponível')
let destino='Barbearia Leandro David, Rua Coronel Fernandes Martins, 251, em frente à UDESC, Laguna - SC'
navigator.geolocation.getCurrentPosition(pos=>{
let lat=pos.coords.latitude
let lon=pos.coords.longitude
let urlCarro=`https://www.google.com/maps/dir/?api=1&origin=${lat},${lon}&destination=${encodeURIComponent(destino)}&travelmode=driving`
let urlPe=`https://www.google.com/maps/dir/?api=1&origin=${lat},${lon}&destination=${encodeURIComponent(destino)}&travelmode=walking`
safe('geoCliente').innerHTML=`
<div class="rotasSalao">
<p><strong>Localização detectada.</strong></p>
<button onclick="window.open('${urlCarro}','_blank')" class="principal">Rota de Carro</button>
<button onclick="window.open('${urlPe}','_blank')" class="principal">Rota a Pé</button>
</div>
`
},()=>alert('Não foi possível obter localização'))
}
/*=========================================================
029 DASHBOARD EXECUTIVO
=========================================================*/
async function carregarDashboard(){
let hoje=dataHoje()
let inicioMes=hoje.substring(0,7)+'-01'
let {data=[]}=await client.from('agendamentos').select('valor,status,data_agendamento,servicos(nome),barbeiros(nome)').gte('data_agendamento',inicioMes)
let hojeLista=data.filter(x=>x.data_agendamento===hoje&&x.status==='finalizado')
let finalizados=data.filter(x=>x.status==='finalizado')
let receitaHoje=hojeLista.reduce((t,x)=>t+Number(x.valor||0),0)
let receitaMes=finalizados.reduce((t,x)=>t+Number(x.valor||0),0)
let ocupacao=Math.round((hojeLista.length/24)*100)
let servicos={}
let barbeiros={}
finalizados.forEach(x=>{
let servico=x.servicos?.nome||'Sem serviço'
let barbeiro=x.barbeiros?.nome||'Sem barbeiro'
servicos[servico]=(servicos[servico]||0)+1
barbeiros[barbeiro]=(barbeiros[barbeiro]||0)+Number(x.valor||0)
})
let melhorBarbeiro=Object.entries(barbeiros).sort((a,b)=>b[1]-a[1])[0]
let melhorServico=Object.entries(servicos).sort((a,b)=>b[1]-a[1])[0]
if(safe('dashHoje'))safe('dashHoje').innerText='R$ '+moeda(receitaHoje)
if(safe('dashMes'))safe('dashMes').innerText='R$ '+moeda(receitaMes)
if(safe('dashClientes'))safe('dashClientes').innerText=hojeLista.length
if(safe('dashOcupacao'))safe('dashOcupacao').innerText=ocupacao+'%'
if(safe('dashBarbeiro'))safe('dashBarbeiro').innerText=melhorBarbeiro?melhorBarbeiro[0]:'-'
if(safe('dashServico'))safe('dashServico').innerText=melhorServico?melhorServico[0]:'-'
}
/*=========================================================
030 RELATORIO PDF DIARIO PERSONALIZADO
=========================================================*/
async function gerarRelatorioDiarioPDF(){
let data=safe('dataPainel').value||dataHoje()
let {data:lista=[],error}=await client.from('agendamentos').select('*,clientes(nome,telefone),servicos(nome),barbeiros(nome)').eq('data_agendamento',data).order('hora_solicitada')
if(error)return alert('Erro ao gerar relatório')
let {data:cfg}=await client.from('configuracoes').select('*').limit(1).maybeSingle()
const {jsPDF}=window.jspdf
let doc=new jsPDF('p','mm','a4')
let margem=10
let y=12
let nomeSalao=cfg?.nome_salao||'BARBEARIA LEANDRO DAVID'
let telefoneSalao=cfg?.telefone||''
let enderecoSalao=cfg?.endereco||''
let logo=await carregarLogoRelatorio()
doc.setFillColor(8,15,35)
doc.rect(0,0,210,34,'F')
if(logo)doc.addImage(logo,'PNG',10,6,22,22)
doc.setTextColor(255,255,255)
doc.setFontSize(17)
doc.setFont(undefined,'bold')
doc.text(nomeSalao,logo?36:10,14)
doc.setFontSize(9)
doc.setFont(undefined,'normal')
doc.text(`Relatório Diário - ${dataBR(data)}`,logo?36:10,21)
doc.text(`${telefoneSalao}${telefoneSalao&&enderecoSalao?' | ':''}${enderecoSalao}`,logo?36:10,27,{maxWidth:160})
y=42
let concluidos=lista.filter(a=>a.status==='finalizado')
let agendados=lista.filter(a=>['aguardando','aceito','confirmado','proximo','em_atendimento'].includes(a.status))
let desistencias=lista.filter(a=>['cancelado','recusado','desistente'].includes(a.status)||a.compareceu===false)
let demais=lista.filter(a=>!concluidos.includes(a)&&!agendados.includes(a)&&!desistencias.includes(a))
let totalConcluido=concluidos.reduce((t,a)=>t+Number(a.valor||0),0)
let totalGeral=lista.reduce((t,a)=>t+Number(a.valor||0),0)
y=cardsResumoRelatorio(doc,y,[
['Total do Dia',lista.length],
['Concluídos',concluidos.length],
['Agendados',agendados.length],
['Desistências',desistencias.length],
['Receita Finalizada','R$ '+moeda(totalConcluido)]
])
y+=6
y=tabelaRelatorio(doc,y,'TRABALHOS CONCLUÍDOS',concluidos,true)
y=tabelaRelatorio(doc,y,'AGENDADOS / EM ATENDIMENTO / AGUARDANDO',agendados,false)
y=tabelaRelatorio(doc,y,'DESISTÊNCIAS / RECUSADOS / CANCELADOS / NÃO COMPARECEU',desistencias,false)
if(demais.length)y=tabelaRelatorio(doc,y,'DEMAIS SITUAÇÕES',demais,false)
if(y>250){doc.addPage();y=15}
doc.setFillColor(8,15,35)
doc.rect(10,y,190,12,'F')
doc.setTextColor(255,255,255)
doc.setFontSize(11)
doc.setFont(undefined,'bold')
doc.text(`TOTAL FINALIZADO: R$ ${moeda(totalConcluido)}    |    TOTAL GERAL LANÇADO: R$ ${moeda(totalGeral)}`,14,y+8)
doc.setTextColor(0,0,0)
doc.setFontSize(8)
doc.setFont(undefined,'normal')
doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`,10,287)
doc.text('Sistema de Agendamento - Barbearia',145,287)
doc.save(`relatorio-diario-${data}.pdf`)
}
async function carregarLogoRelatorio(){
try{
let caminhos=['barbeariald.png','img/logo.png','assets/logo.png','assets/barbearia.png','logo.png']
for(let c of caminhos){
let r=await fetch(c)
if(r.ok){
let blob=await r.blob()
return await blobParaDataURL(blob)
}
}
return null
}catch(e){
return null
}
}
function blobParaDataURL(blob){
return new Promise(resolve=>{
let reader=new FileReader()
reader.onloadend=()=>resolve(reader.result)
reader.readAsDataURL(blob)
})
}
function cardsResumoRelatorio(doc,y,itens){
let x=10
itens.forEach((item,i)=>{
let w=i===4?46:34
doc.setFillColor(245,247,250)
doc.roundedRect(x,y,w,18,2,2,'F')
doc.setDrawColor(210,220,235)
doc.roundedRect(x,y,w,18,2,2,'S')
doc.setTextColor(8,15,35)
doc.setFontSize(8)
doc.setFont(undefined,'normal')
doc.text(String(item[0]),x+3,y+6)
doc.setFontSize(12)
doc.setFont(undefined,'bold')
doc.text(String(item[1]),x+3,y+14)
x+=w+3
})
return y+22
}
function tabelaRelatorio(doc,y,titulo,lista,mostrarTotal){
if(y>245){doc.addPage();y=15}
doc.setFillColor(8,15,35)
doc.rect(10,y,190,9,'F')
doc.setTextColor(255,255,255)
doc.setFontSize(10)
doc.setFont(undefined,'bold')
doc.text(titulo,12,y+6)
y+=11
if(!lista.length){
doc.setTextColor(90,90,90)
doc.setFontSize(9)
doc.setFont(undefined,'normal')
doc.text('Nenhum registro encontrado.',12,y+5)
return y+12
}
let colunas=[
{t:'Data',x:10,w:22},
{t:'Hora',x:32,w:18},
{t:'Nome',x:50,w:43},
{t:'Serviço',x:93,w:36},
{t:'Barbeiro',x:129,w:32},
{t:'Situação',x:161,w:24},
{t:'Valor',x:185,w:15}
]
doc.setFillColor(225,232,242)
doc.rect(10,y,190,8,'F')
doc.setTextColor(8,15,35)
doc.setFontSize(8)
doc.setFont(undefined,'bold')
colunas.forEach(c=>doc.text(c.t,c.x+1,y+5))
y+=8
doc.setFont(undefined,'normal')
lista.forEach((a,i)=>{
if(y>275){doc.addPage();y=15}
let cor=i%2===0?250:242
doc.setFillColor(cor,cor,cor)
doc.rect(10,y,190,8,'F')
doc.setTextColor(0,0,0)
doc.setFontSize(7)
let linha=[
dataBR(a.data_agendamento),
formatarHora(a.hora_solicitada),
a.clientes?.nome||'',
a.servicos?.nome||'',
a.barbeiros?.nome||'',
textoStatusRelatorio(a),
'R$ '+moeda(a.valor)
]
colunas.forEach((c,idx)=>{
let txt=String(linha[idx]||'')
doc.text(txt,c.x+1,y+5,{maxWidth:c.w-2})
})
y+=8
})
if(mostrarTotal){
let total=lista.reduce((t,a)=>t+Number(a.valor||0),0)
doc.setFillColor(235,247,238)
doc.rect(10,y,190,8,'F')
doc.setTextColor(8,80,35)
doc.setFontSize(8)
doc.setFont(undefined,'bold')
doc.text(`Subtotal concluído: R$ ${moeda(total)}`,12,y+5)
y+=10
}
return y+5
}
function textoStatusRelatorio(a){
if(a.compareceu===false)return'Não compareceu'
if(a.status==='em_atendimento')return'Em atendimento'
if(a.status==='finalizado')return'Finalizado'
if(a.status==='aguardando')return'Aguardando'
if(a.status==='aceito')return'Aceito'
if(a.status==='confirmado')return'Confirmado'
if(a.status==='proximo')return'Próximo'
if(a.status==='cancelado')return'Cancelado'
if(a.status==='recusado')return'Recusado'
if(a.status==='desistente')return'Desistente'
return a.status||'-'
}
/*=========================================================
031 BACKUP CSV
=========================================================*/
async function gerarBackupCSV(){
let {data:lista=[]}=await client.from('agendamentos').select('*,clientes(nome,telefone),servicos(nome),barbeiros(nome)').order('data_agendamento',{ascending:false})
let linhas=['data,hora,cliente,telefone,servico,barbeiro,status,valor']
lista.forEach(a=>{
linhas.push(`${dataBR(a.data_agendamento)},${formatarHora(a.hora_solicitada)},${a.clientes?.nome||''},${a.clientes?.telefone||''},${a.servicos?.nome||''},${a.barbeiros?.nome||''},${a.status},${moeda(a.valor)}`)
})
let blob=new Blob([linhas.join('\n')],{type:'text/csv;charset=utf-8'})
let url=URL.createObjectURL(blob)
let a=document.createElement('a')
a.href=url
a.download='backup-barbearia.csv'
a.click()
URL.revokeObjectURL(url)
}
/*=========================================================
032 ABRIR MAPA
=========================================================*/
async function abrirMapaSalao(){
let destino='Barbearia Leandro David, Rua Coronel Fernandes Martins, 251, em frente à UDESC, Laguna - SC'
window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destino)}`,'_blank')
}
/*=========================================================
033 CARREGAR CONFIGURACOES
=========================================================*/
async function carregarConfiguracoes(){
let {data,error}=await client.from('configuracoes').select('*').limit(1).maybeSingle()
if(error){console.error(error);return}
if(!data)return
if(safe('cfgNomeSalao'))safe('cfgNomeSalao').value=data.nome_salao||''
if(safe('cfgTelefone'))safe('cfgTelefone').value=data.telefone||''
if(safe('cfgEndereco'))safe('cfgEndereco').value=data.endereco||''
if(safe('cfgInstagram'))safe('cfgInstagram').value=data.instagram||''
if(safe('cfgInicio'))safe('cfgInicio').value=formatarHora(data.inicio_expediente)||'08:30'
if(safe('cfgFim'))safe('cfgFim').value=formatarHora(data.fim_expediente)||'20:00'
}
/*=========================================================
034 SALVAR CONFIGURACOES
=========================================================*/
async function salvarConfiguracoes(){
let payload={
nome_salao:safe('cfgNomeSalao').value.trim(),
telefone:safe('cfgTelefone').value.trim(),
endereco:safe('cfgEndereco').value.trim(),
instagram:safe('cfgInstagram').value.trim(),
inicio_expediente:safe('cfgInicio').value,
fim_expediente:safe('cfgFim').value
}
let {data:existe,error:erroBusca}=await client.from('configuracoes').select('id').limit(1).maybeSingle()
if(erroBusca){
console.error(erroBusca)
alert('Erro ao localizar configurações')
return
}
let r=null
if(existe?.id){
r=await client.from('configuracoes').update(payload).eq('id',existe.id)
}else{
r=await client.from('configuracoes').insert(payload)
}
if(r.error){
console.error(r.error)
alert(r.error.message)
return
}
alert('Configurações salvas')
}
/*=========================================================
035 CARREGAR SERVICOS ADMIN
=========================================================*/
async function carregarServicosAdmin(){
let {data=[],error}=await client.from('servicos').select('*').order('nome')
if(error)return console.error(error)
safe('listaServicosAdmin').innerHTML=data.map(s=>`<div class="itemAgenda"><strong>${s.nome}</strong><p>R$ ${moeda(s.valor)} | ${s.duracao_minutos} min | ${s.ativo?'Ativo':'Excluído'}</p><div class="botoes"><button class="btnAtender" onclick="editarServico('${s.id}','${s.nome}',${s.valor},${s.duracao_minutos},${s.ativo})">Editar</button><button class="btnRecusar" onclick="excluirServico('${s.id}')">Excluir</button></div></div>`).join('')
}
/*=========================================================
036 SALVAR SERVICO
=========================================================*/
async function salvarServico(){
let id=safe('servicoId').value
let payload={
nome:safe('servicoNome').value.trim(),
valor:Number(safe('servicoValor').value||0),
duracao_minutos:Number(safe('servicoDuracao').value||30),
ativo:true
}
if(!payload.nome)return alert('Informe o serviço')
let erro=null
if(id){
let r=await client.from('servicos').update(payload).eq('id',id)
erro=r.error
}else{
let r=await client.from('servicos').insert(payload)
erro=r.error
}
if(erro)return alert('Erro ao salvar serviço')
limparServico()
await carregarServicos()
await carregarServicosAdmin()
}
/*=========================================================
037 EDITAR SERVICO
=========================================================*/
function editarServico(id,nome,valor,duracao,ativo){
safe('servicoId').value=id
safe('servicoNome').value=nome
safe('servicoValor').value=valor
safe('servicoDuracao').value=duracao
}
/*=========================================================
038 LIMPAR SERVICO
=========================================================*/
function limparServico(){
safe('servicoId').value=''
safe('servicoNome').value=''
safe('servicoValor').value=''
safe('servicoDuracao').value=''
}
/*=========================================================
039 EXCLUIR SERVICO
=========================================================*/
async function excluirServico(id){
if(!confirm('Excluir este serviço?'))return
await client.from('servicos').update({ativo:false}).eq('id',id)
await carregarServicos()
await carregarServicosAdmin()
}
/*=========================================================
040 CARREGAR BARBEIROS ADMIN
=========================================================*/
async function carregarBarbeirosAdmin(){
let {data=[],error}=await client.from('barbeiros').select('*').order('nome')
if(error)return console.error(error)
safe('listaBarbeirosAdmin').innerHTML=data.map(b=>`<div class="itemAgenda"><strong>${b.nome}</strong><p>${b.telefone||''} | ${b.ativo?'Ativo':'Excluído'}</p><div class="botoes"><button class="btnAtender" onclick="editarBarbeiro('${b.id}','${b.nome}','${b.telefone||''}',${b.ativo})">Editar</button><button class="btnRecusar" onclick="excluirBarbeiro('${b.id}')">Excluir</button></div></div>`).join('')
}
/*=========================================================
041 SALVAR BARBEIRO
=========================================================*/
async function salvarBarbeiro(){
let id=safe('barbeiroId').value
let payload={
nome:safe('barbeiroNome').value.trim(),
telefone:safe('barbeiroTelefone').value.trim(),
ativo:true
}
if(!payload.nome)return alert('Informe o barbeiro')
let erro=null
if(id){
let r=await client.from('barbeiros').update(payload).eq('id',id)
erro=r.error
}else{
let r=await client.from('barbeiros').insert(payload)
erro=r.error
}
if(erro)return alert('Erro ao salvar barbeiro')
limparBarbeiro()
await carregarBarbeiros()
await carregarBarbeirosAdmin()
}
/*=========================================================
042 EDITAR BARBEIRO
=========================================================*/
function editarBarbeiro(id,nome,telefone,ativo){
safe('barbeiroId').value=id
safe('barbeiroNome').value=nome
safe('barbeiroTelefone').value=telefone
}
/*=========================================================
043 LIMPAR BARBEIRO
=========================================================*/
function limparBarbeiro(){
safe('barbeiroId').value=''
safe('barbeiroNome').value=''
safe('barbeiroTelefone').value=''
}
/*=========================================================
044 EXCLUIR BARBEIRO
=========================================================*/
async function excluirBarbeiro(id){
if(!confirm('Excluir este barbeiro?'))return
await client.from('barbeiros').update({ativo:false}).eq('id',id)
await carregarBarbeiros()
await carregarBarbeirosAdmin()
}
/*=========================================================
045 CARREGAR CLIENTES ADMIN
=========================================================*/
async function carregarClientesAdmin(){
let busca=safe('buscaClienteAdmin')?.value?.trim()||''
let query=client.from('clientes').select('*').order('nome')
if(busca)query=query.ilike('nome',`%${busca}%`)
let {data=[],error}=await query
if(error)return console.error(error)
safe('listaClientesAdmin').innerHTML=data.map(c=>`
<div class="itemAgenda">
<div style="display:flex;gap:12px;align-items:center">
${c.foto_url?`<img src="${c.foto_url}" style="width:56px;height:56px;border-radius:50%;object-fit:cover">`:''}
<div>
<strong>${c.nome}</strong>
<p>${c.telefone||''}</p>
<p>Pontos: ${c.pontos||0} | Atendimentos: ${c.atendimentos||0}</p>
<p>${c.observacao||''}</p>
</div>
</div>
</div>
`).join('')
}
/*=========================================================
046 SALVAR CLIENTE ADMIN
=========================================================*/
async function salvarClienteAdmin(){
let id=safe('clienteAdminId').value
let payload={
nome:safe('clienteAdminNome').value.trim(),
telefone:safe('clienteAdminTelefone').value.trim(),
observacao:safe('clienteAdminObservacao').value.trim()
}
if(!payload.nome||!payload.telefone)return alert('Informe nome e telefone')
let r=null
if(id){
r=await client.from('clientes').update(payload).eq('id',id).select().single()
}else{
r=await client.from('clientes').insert(payload).select().single()
}
if(r.error){
console.error(r.error)
alert('Erro ao salvar cliente')
return
}
clienteAdminAtualId=r.data.id
safe('clienteAdminId').value=r.data.id
alert('Cliente salvo. Agora você pode enviar a selfie.')
await carregarClientesAdmin()
}
/*=========================================================
046A ENVIAR SELFIE CLIENTE
=========================================================*/
async function enviarSelfieCliente(){
let cliente_id=safe('clienteAdminId')?.value||clienteAdminAtualId
let file=safe('clienteFoto')?.files?.[0]
if(!cliente_id)return alert('Salve o cliente antes de enviar a selfie.')
if(!file)return alert('Selecione ou tire uma selfie.')
let ext=(file.name.split('.').pop()||'jpg').toLowerCase()
let path=`selfies/${cliente_id}.${ext}`
let {error:erroUpload}=await client.storage.from('clientes').upload(path,file,{upsert:true,contentType:file.type})
if(erroUpload){
console.error(erroUpload)
alert('Erro ao enviar selfie.')
return
}
let {data:publicData}=client.storage.from('clientes').getPublicUrl(path)
let foto_url=publicData.publicUrl
let {error:erroUpdate}=await client.from('clientes').update({foto_url}).eq('id',cliente_id)
if(erroUpdate){
console.error(erroUpdate)
alert('Selfie enviada, mas erro ao salvar URL no cliente.')
return
}
if(safe('previewSelfieCliente')){
safe('previewSelfieCliente').src=foto_url
safe('previewSelfieCliente').style.display='block'
}
alert('Selfie salva com sucesso.')
await carregarClientesAdmin()
}
/*=========================================================
047 LIMPAR CLIENTE ADMIN
=========================================================*/
function limparClienteAdmin(){
safe('clienteAdminId').value=''
safe('clienteAdminNome').value=''
safe('clienteAdminTelefone').value=''
safe('clienteAdminObservacao').value=''
}
/*=========================================================
048 CARREGAR MODULOS ADMIN
=========================================================*/
async function carregarModulosAdmin(){
await carregarConfiguracoes()
await carregarServicosAdmin()
await carregarBarbeirosAdmin()
await carregarClientesAdmin()
}
/*=========================================================
049 ABRIR MODULO ADMIN
=========================================================*/
function abrirModuloAdmin(id){
document.querySelectorAll('.moduloAdmin').forEach(x=>x.classList.add('hidden'))
safe(id).classList.remove('hidden')
}
/*=========================================================
050 ATUALIZAR ADMIN AO ABRIR PAINEL
=========================================================*/
async function atualizarAdminPainel(){
await carregarPainel()
await carregarRecepcao()
await carregarCaixa()
await carregarReceitaBarbeiros()
await carregarDashboard()
await carregarModulosAdmin()
}
/*=========================================================
051 LOGOUT ADMIN
=========================================================*/
function sairAdmin(){
localStorage.removeItem('barbearia_admin')
painelProprietario=false
safe('viewCliente').classList.remove('hidden')
safe('viewProprietario').classList.add('hidden')
safe('loginAdmin').classList.add('hidden')
safe('btnPainel').innerText='Painel Proprietário'
}
/*=========================================================
052 LOGIN ADMIN RESTRITO
=========================================================*/
async function entrarAdminRestrito(){
let login=safe('loginUsuario').value.trim()
let senha=safe('senhaUsuario').value.trim()
let {data,error}=await client.from('usuarios').select('*').eq('login',login).eq('senha',senha).in('perfil',['ceo','admin']).eq('ativo',true).maybeSingle()
if(error){console.error(error);alert('Erro no login');return}
if(!data){alert('Acesso restrito ao CEO e ao Admin');return}
localStorage.setItem('barbearia_admin','SIM')
localStorage.setItem('barbearia_perfil',data.perfil)
safe('loginAdmin').classList.add('hidden')
safe('viewProprietario').classList.remove('hidden')
await atualizarAdminPainel()
}
/*=========================================================
053 SAIR ADMIN RESTRITO
=========================================================*/
function sairAdminRestrito(){
localStorage.removeItem('barbearia_admin')
localStorage.removeItem('barbearia_perfil')
safe('loginAdmin').classList.remove('hidden')
safe('viewProprietario').classList.add('hidden')
}
/*=========================================================
054 PROTEGER ADMIN
=========================================================*/
async function protegerAdmin(){
if(!location.pathname.includes('admin.html'))return
if(localStorage.getItem('barbearia_admin')==='SIM'){
safe('loginAdmin').classList.add('hidden')
safe('viewProprietario').classList.remove('hidden')
await atualizarAdminPainel()
}
}
/*=========================================================
0  service worker
=========================================================*/
if('serviceWorker' in navigator){
window.addEventListener('load',()=>{
navigator.serviceWorker.register('./sw.js')
})
}
