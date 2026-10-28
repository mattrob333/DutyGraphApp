"""Build the proposed OpenAPI 3.1 contract. Does not contact any service."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
s=lambda **extra: {'type':'string',**extra}
i=lambda **extra: {'type':'integer',**extra}
b={'type':'boolean'}
a=lambda items,**extra:{'type':'array','items':items,**extra}
o=lambda props,required=None,**extra:{'type':'object','properties':props,'required':list(props) if required is None else required,**extra}
r=lambda name:{'$ref':'#/components/schemas/'+name}
nullable=lambda schema:{'anyOf':[schema,{'type':'null'}]}
uid=s(format='uuid');dt=s(format='date-time');hs=s(pattern='^[a-f0-9]{64}$');obj={'type':'object'}
S={}
S['ApiError']=o({'code':s(pattern='^[A-Z0-9_]+$'),'message':s(),'retryable':b,'requestId':uid},additionalProperties=False)
S['Person']=o({'id':uid,'name':s(),'role':s(),'department':s()})
S['Attendee']=o({'personId':nullable(uid),'name':s(),'guest':o({'name':s(),'role':s()}),'roles':a(s(enum=['decision_maker','influencer','resource','executor','needs_to_know']),minItems=1)},['personId','roles'])
S['Topic']=o({'id':s(),'title':s(),'minutes':i(minimum=1),'forPersonIds':a(uid),'questions':a(s()),'outcomeIds':a(s()),'async':b})
S['Gate']=o({'mode':s(enum=['ASYNC','LIVE','HYBRID','NO_MEETING','INSUFFICIENT_INFO']),'route':s(enum=['NO_MEETING','ASYNC','INDIVIDUAL_INTERVIEW','LIVE','HUMAN_LED','HUMAN_ESCALATION']),'reason':s(),'requiredPersonIds':a(uid),'releasedPersonIds':a(uid),'liveMinutes':nullable(i(minimum=0)),'asyncTopicIds':a(s()),'judgedBy':s(enum=['rules','model'])})
meeting_types=['INFORMATIONAL','DECISION','PROBLEM_SOLVING','BRAINSTORMING','TEAM_BUILDING','INSTRUCTIONAL']
S['MeetingCreate']=o({'title':s(minLength=1,maxLength=200),'startsAt':nullable(dt),'minutes':i(minimum=1,maximum=480),'purpose':s(maxLength=4000),'outcomes':a(s(maxLength=1000),maxItems=20),'execution':s(maxLength=4000),'attendees':a(r('Attendee'),maxItems=80),'meetingType':s(enum=meeting_types),'agenda':a(r('Topic'),maxItems=30),'previousMeetingId':uid},['title','minutes','purpose','outcomes','execution','attendees'],additionalProperties=False)
S['Meeting']=o({'id':uid,'companyId':uid,'version':i(minimum=1),'hash':hs,'title':s(),'startsAt':nullable(dt),'minutes':i(),'power':o({'purpose':s(),'outcomes':a(s()),'execution':s()}),'attendees':a(r('Attendee')),'meetingType':nullable(s(enum=meeting_types)),'secondaryPhases':a(s(enum=meeting_types)),'agenda':a(r('Topic')),'gate':nullable(r('Gate')),'routeChoice':nullable(s(enum=['pulse','shorter','as_planned'])),'state':s(),'createdBy':uid,'createdAt':dt,'updatedAt':dt,'previousMeetingId':uid},['id','companyId','version','hash','title','startsAt','minutes','power','attendees','meetingType','secondaryPhases','agenda','gate','routeChoice','state','createdBy','createdAt','updatedAt'])
S['Consent']=o({'personKey':s(),'name':s(),'state':s(enum=['pending','consented','declined']),'at':nullable(dt)})
S['Session']=o({'id':uid,'meetingId':uid,'companyId':uid,'version':i(minimum=1),'hash':hs,'mode':s(enum=['capture','copilot','facilitator']),'voice':nullable(s(enum=['tts_lines','realtime','simulated'])),'facilitatorState':s(),'currentTopicId':nullable(s()),'topicStartedAt':nullable(dt),'consents':a(r('Consent')),'noticeVersion':s(),'appVersion':s(),'startedAt':nullable(dt),'endedAt':nullable(dt),'promptVersion':nullable(s()),'promptHash':nullable(hs),'budgetCents':i(minimum=0),'spentCents':i(minimum=0),'log':a(o({'at':dt,'actor':s(enum=['leader','ai','system']),'kind':s(),'from':s(),'to':s(),'reason':s()},['at','actor','kind']))})
S['Transcript']=o({'id':uid,'revision':i(minimum=1),'sessionId':uid,'startMs':{'type':'number','minimum':0},'endMs':{'type':'number','minimum':0},'text':s(maxLength=12000),'speakerCluster':nullable(s()),'source':s(enum=['live','batch']),'committed':b,'excluded':s(enum=['declined_consent','deleted_by_leader'])},['id','revision','sessionId','startMs','endMs','text','speakerCluster','source','committed'])
S['Source']=o({'segmentId':uid,'revision':i(minimum=1),'quote':s(),'speakerCluster':nullable(s()),'personKey':nullable(s())})
S['Proposal']=o({'id':uid,'sessionId':uid,'kind':s(enum=['decision','action','open_question','task_card_delta','responsibility_delta','contradiction','claim']),'state':s(enum=['proposed','accepted','rejected','stale']),'version':i(minimum=1),'hash':hs,'sources':a(r('Source'),minItems=1),'evidence':s(enum=['observed','belief','assumption']),'body':o({'kind':s()},['kind']),'decidedBy':nullable(uid),'decidedAt':nullable(dt),'editNote':s()},['id','sessionId','kind','state','version','hash','sources','evidence','body','decidedBy','decidedAt'])
S['SpeakerMap']=o({'sessionId':uid,'entries':a(o({'cluster':s(),'personKey':nullable(s()),'suggested':b,'confirmedBy':nullable(uid)}))})
S['Parked']=o({'id':uid,'sessionId':uid,'text':s(),'speakerCluster':nullable(s()),'atMs':{'type':'number'},'followUp':nullable(o({'personId':uid,'requestId':nullable(uid)}))})
S['ClosingItem']=o({'proposalId':uid,'ownerPersonKey':nullable(s()),'confirmation':s(enum=['pending','confirmed','changed','not_mine']),'note':s()},['proposalId','ownerPersonKey','confirmation'])
S['ClosingOutcomeReview']=o({'outcomeId':s(),'status':s(enum=['met','partly_met','deferred','dropped']),'ownerPersonKey':nullable(s()),'dueAt':nullable(dt),'note':s(maxLength=2000)},['outcomeId','status','ownerPersonKey','dueAt'],additionalProperties=False)
S['ClosingReadiness']=o({'complete':b,'partial':b,'missingOutcomes':i(),'unconfirmedActions':i()})
S['SessionSnapshot']={'allOf':[r('Session'),o({'transcript':a(r('Transcript')),'parked':a(r('Parked')),'speakerMap':r('SpeakerMap'),'proposals':a(r('Proposal')),'closing':a(r('ClosingItem')),'outcomeReviews':a(r('ClosingOutcomeReview')),'followUpPlan':s(),'closingReadiness':r('ClosingReadiness')})]}
S['AdvisorTaskCard']=o({'id':uid,'title':s(),'version':i(minimum=1),'hash':hs,'state':s(),'data':o({**{field:s() for field in ['title','duty','ownerId','performerId','purpose','trigger','inputs','instructions','output','humanGate','destination','mode']},'systems':a(s())})})
S['QuestionHint']=o({'id':s(),'label':s(maxLength=40),'nudge':s(),'cues':a(s())})
S['Question']=o({'key':s(pattern='^question\\.\\d+$'),'index':i(),'text':s(),'short':s(),'hints':a(r('QuestionHint')),'isElse':b},['key','index','text','short','hints'])
S['Pulse']=o({'id':uid,'meetingId':nullable(uid),'title':s(),'dueAt':dt,'estimateMinutes':{'type':'number'},'perPerson':a(o({'personId':uid,'questions':a(r('Question')),'state':s(enum=['not_started','in_progress','complete'])}))})
S['ParticipantPulse']=o({'id':uid,'meetingId':nullable(uid),'title':s(),'dueAt':dt,'estimateMinutes':{'type':'number'},'questions':a(r('Question')),'version':i(minimum=1),'contentHash':hs,'state':s(enum=['not_started','in_progress','complete'])})
S['TeamStatus']=o({'total':i(minimum=0),'done':i(minimum=0),'people':a(o({'name':s(),'state':s(enum=['not_started','in_progress','complete'])},additionalProperties=False))},additionalProperties=False)
S['AdvisorSession']=o({'accessToken':s(minLength=32),'refreshToken':s(minLength=32),'accessExpiresAt':dt,'expiresAt':dt,'advisor':o({'id':uid,'name':s()}),'company':o({'id':uid,'name':s()}),'role':s(const='advisor_mobile'),'tokenType':s(const='Bearer'),'deviceId':uid,'idempotentReplay':b})
S['Config']=o({'speakQuestions':b,'followUps':s(enum=['table','ai']),'autoAdvance':b,'liveTranscription':b},additionalProperties=False)
S['VoiceLinesRequest']=o({'requestId':s(),'sessionId':uid,'voice':s(maxLength=60),'speed':{'type':'number','minimum':0.5,'maximum':2},'lines':a(o({'id':s(),'text':s(minLength=1,maxLength=400)},additionalProperties=False),minItems=1,maxItems=40)},['lines'],additionalProperties=False)
S['VoiceLines']=o({'lines':a(o({'id':s(),'url':s(),'hash':hs,'durationMs':{'type':'number','minimum':0}}),maxItems=40)},additionalProperties=False)
S['LiveGrant']={'oneOf':[o({'available':{'const':False},'reason':s()},additionalProperties=False),o({'available':{'const':True},'clientSecret':s(),'expiresAt':i(),'wsUrl':s(),'model':s(),'transcription':obj})]}
S['Coach']=o({'currentTopicId':nullable(s()),'nextQuestion':s(),'addressedToPersonId':nullable(uid),'stillNeeded':a(s()),'flags':a(o({'kind':s(),'text':s()})),'remainingMs':{'type':'number','minimum':0},'budgetReached':b})
S['FacilitatorTurn']=o({'text':s(),'action':s(enum=['ASK_QUESTION','ASK_FOLLOW_UP','REQUEST_EXAMPLE','CLARIFY_AMBIGUITY','SUMMARIZE_FINDING','CONFIRM_FINDING','TRANSITION_TOPIC','FLAG_CONTRADICTION','REQUEST_HUMAN_REVIEW','PARK_TOPIC','RECOMMEND_CLOSURE','CLOSE_SESSION']),'addressedToPersonId':uid,'promptVersion':s(),'promptHash':hs},['text','action','promptVersion','promptHash'])
S['SetupProposal']=o({'fieldPath':s(),'value':s(),'quote':s(),'missingFields':a(s()),'source':s(enum=['owner_supplied','advisor_supplied'])})
paths={}
def route(base,path,method,response=obj,request=None,public=False,status='200',command=True,binary=False):
    full=base+path
    import re
    pars=[{'name':name,'in':'path','required':True,'schema':s()} for name in re.findall(r'\{([^}]+)\}',full)]
    if method in ['post','patch'] and command:
        pars.append({'name':'Idempotency-Key','in':'header','required':True,'schema':s(minLength=1,maxLength=200)})
    op={'operationId':method+'_'+re.sub('[^A-Za-z0-9]+','_',full).strip('_'),'security':[] if public else [{'bearerAuth':[]}],'responses':{status:{'description':'Acknowledged by the server.','content':{'audio/mpeg' if binary else 'application/json':{'schema':response}}},'default':{'description':'Request failed.','content':{'application/json':{'schema':r('ApiError')}}}}}
    if pars:op['parameters']=pars
    if request is not None:op['requestBody']={'required':True,'content':{'application/json':{'schema':request}}}
    paths.setdefault(full,{})[method]=op
B='/api/mobile/meetings/v1'; X='/api/mobile/v1x'
route('','/health','get',o({'ok':b,'mode':s(enum=['fake','proxy']),'providers':obj,'fixtureAdditions':b}),public=True)
route('', '/dev/pairing-code','post',o({'pairingCode':s(),'expiresAt':dt}),obj,True,command=False)
route(B,'/advisor/pair','post',r('AdvisorSession'),o({'pairingCode':s(minLength=6,maxLength=128),'deviceLabel':s(maxLength=80)},['pairingCode']),True,status='201')
route(B,'/advisor/session/refresh','post',r('AdvisorSession'),o({'refreshToken':s(minLength=32)}),True)
route(B,'/advisor/session/logout','post',obj,None,status='204',command=False)
paths[B+'/advisor/session/logout']['post']['responses']['204'].pop('content')
route(B,'/advisor/me','get',o({'advisor':o({'id':uid,'name':s()}),'company':o({'id':uid,'name':s()}),'role':s(const='advisor_mobile')}))
route(B,'/people','get',o({'people':a(r('Person'))}))
route(B,'/task-cards','get',o({'taskCards':a(r('AdvisorTaskCard'))}))
route(B,'/task-cards/{id}','get',r('AdvisorTaskCard'))
route(B,'/meetings','get',o({'meetings':a(r('Meeting'))}))
route(B,'/meetings','post',r('Meeting'),r('MeetingCreate'),status='201')
route(B,'/meetings/{id}','get',r('Meeting'))
route(B,'/meetings/{id}','patch',r('Meeting'),o({**S['MeetingCreate']['properties'],'expectedVersion':i(minimum=1),'contentHash':hs},['expectedVersion'],additionalProperties=False))
route(B,'/meetings/{id}/gate-suggestion','post',o({'deterministic':r('Gate'),'suggestion':{'type':'null'},'status':s()}),o({},[],additionalProperties=False))
route(B,'/meetings/{id}/plan','post',o({'meetingType':s(enum=meeting_types),'typeReason':s(),'agenda':a(r('Topic')),'gate':r('Gate'),'meeting':r('Meeting')}),obj)
route(B,'/meetings/{id}/route','post',r('Meeting'),o({'choice':s(enum=['pulse','shorter','as_planned']),'expectedVersion':i()},['choice']))
route(B,'/meetings/{id}/pulse','post',r('Pulse'),o({'dueAt':dt},[]),status='201')
route(B,'/meetings/{id}/pulse','get',o({'pulses':a(r('Pulse')),'gate':nullable(r('Gate'))}))
route(B,'/meetings/{id}/sessions','post',r('Session'),o({'mode':s(enum=['capture','copilot','facilitator']),'voice':s(enum=['tts_lines','realtime','simulated'])},['mode']),status='201')
route(B,'/sessions/{id}','get',r('SessionSnapshot'))
route(B,'/sessions/{id}/consent','post',r('Session'),o({'attendees':a(o({'personId':s(),'personKey':s(),'state':s(enum=['consented','declined']),'at':dt},['state','at'])),'noticeVersion':s(minLength=1),'appVersion':s(minLength=1)}))
chunk=o({'segmentIndex':i(minimum=0),'chunkIndex':i(minimum=0),'chunkCount':i(minimum=1,maximum=50),'sha256':hs,'segmentSha256':hs,'data':s(maxLength=710000),'startedAt':dt,'durationMs':{'type':'number','minimum':0,'maximum':300000}},['segmentIndex','chunkIndex','chunkCount','sha256','data'],additionalProperties=False)
chunk_result=o({'segmentIndex':i(),'uploadedChunks':a(i()),'complete':b,'durationMs':{'type':'number','minimum':0}},['segmentIndex','uploadedChunks','complete'])
route(B,'/sessions/{id}/segments','post',chunk_result,chunk)
route(B,'/sessions/{id}/segments','get',o({'segments':a(chunk_result)}))
route(B,'/sessions/{id}/audio/{segmentIndex}','get',s(format='binary'),binary=True)
paths[B+'/sessions/{id}/audio/{segmentIndex}']['get']['responses']['200']['content']['audio/mp4']=paths[B+'/sessions/{id}/audio/{segmentIndex}']['get']['responses']['200']['content'].pop('audio/mpeg')
transcript_input=o({k:v for k,v in S['Transcript']['properties'].items() if k!='sessionId'},['id','revision','startMs','endMs','text'])
transcript_input['properties']['speaker']=nullable(s())
transcript_input['properties']['personKey']=s(minLength=1,maxLength=200)
route(B,'/sessions/{id}/transcript','post',o({'segments':a(r('Transcript'))}),{'oneOf':[a(transcript_input,maxItems=80),o({'segments':a(transcript_input,maxItems=80)})]})
route(B,'/sessions/{id}/coach','post',r('Coach'),obj)
route(B,'/sessions/{id}/park','post',r('Parked'),o({'text':s(minLength=1,maxLength=4000),'speaker':nullable(s()),'speakerCluster':nullable(s()),'atMs':{'type':'number','minimum':0}},['text','atMs']))
route(B,'/sessions/{id}/facilitator/turn','post',r('FacilitatorTurn'),o({'trigger':s(enum=['opening','timebox_end','silence','leader_next','slot_empty','closing'])},additionalProperties=False))
route(B,'/sessions/{id}/realtime','post',obj,o({'sdp':s(maxLength=200000),'summary':s(maxLength=4000)},[]))
route(B,'/sessions/{id}/topic','post',r('Session'),o({'topicId':nullable(s())}))
route(B,'/sessions/{id}/state','post',r('Session'),o({'to':s(),'control':s(enum=['mute','unmute','stop','skip','next_topic','extend_topic']),'topicId':s()},[]))
route(B,'/sessions/{id}/finish','post',o({'session':r('Session'),'proposals':a(r('Proposal'))}),obj)
route(B,'/sessions/{id}/speakers','get',r('SpeakerMap'))
route(B,'/sessions/{id}/speakers','post',r('SpeakerMap'),o({'entries':a(o({'cluster':s(),'personKey':nullable(s()),'suggested':b,'confirmedBy':nullable(s())},['cluster','personKey']))}))
route(B,'/sessions/{id}/proposals','get',o({'proposals':a(r('Proposal'))}))
route(B,'/proposals/{id}/decision','post',r('Proposal'),o({'decision':s(enum=['accept','reject','edit']),'expectedVersion':i(minimum=1),'contentHash':hs,'editNote':s(maxLength=2000),'text':s(maxLength=12000),'ownerPersonKey':nullable(s()),'due':nullable(dt),'sources':a(r('Source'),minItems=1,maxItems=20),'body':o({'kind':s(enum=['decision','action','open_question','task_card_delta','responsibility_delta','contradiction','claim'])},['kind'])},['decision','expectedVersion']))
route(B,'/proposals/{id}/follow-up','post',obj,o({'personId':uid,'text':s(maxLength=4000)},['personId']),status='201')
route(B,'/sessions/{id}/closing','post',o({'items':a(r('ClosingItem'))}),o({'items':a(r('ClosingItem')),'outcomes':a(r('ClosingOutcomeReview')),'followUpPlan':s(maxLength=4000),'expectedVersion':i(minimum=1),'contentHash':s()},[],additionalProperties=False))
route(B,'/sessions/{id}/complete','post',r('Meeting'),o({'expectedVersion':i(minimum=1),'contentHash':s()},additionalProperties=False))
route(B,'/sessions/{id}/export','get',o({'markdown':s(),'json':o({'meeting':r('Meeting'),'session':r('SessionSnapshot')})}))
route(B,'/kickoff/{meetingId}/notes','get',o({'notes':a(obj)}))
route(B,'/kickoff/{meetingId}/notes','post',o({'notes':a(obj),'claims':a(obj)}),o({'notes':a(o({'id':uid,'topicId':s(enum=['business','goals','people','duties','tasks','handoffs','systems','followup']),'speakerPersonId':nullable(uid),'text':s(maxLength=6000),'at':dt},['topicId','speakerPersonId','text']),maxItems=80),'claims':a(obj,maxItems=30)},['notes']))
route(B,'/setup','post',o({'id':uid,'version':i(),'hash':hs,'source':s(),'questions':a(r('Question'))}),o({'source':s(enum=['owner_supplied','advisor_supplied'])},[]),status='201')
route(B,'/setup/{id}/understand','post',o({'proposals':a(r('SetupProposal'))}),o({'answers':{'oneOf':[a(o({'key':s(),'text':s(maxLength=6000),'question':s()},['key','text']),maxItems=12),{'type':'object','additionalProperties':s(maxLength=6000)}]}}))
route(B,'/setup/{id}/confirm','post',o({'confirmed':{'const':True},'proposals':a(r('SetupProposal'))}),o({'proposals':a(r('SetupProposal'),maxItems=12)}))
route(X,'/config','get',r('Config'))
route(X,'/voice/lines','post',r('VoiceLines'),r('VoiceLinesRequest'))
route(X,'/voice/audio/{hash}','get',s(format='binary'),binary=True)
route(X,'/requests/{id}/live-transcription','post',r('LiveGrant'),o({},additionalProperties=False))
route(X,'/requests/{id}/coverage','post',o({'available':b,'covered':a(s()),'followUp':o({'text':s(),'hintId':s()})},['available','covered']),o({'questionKey':s(),'text':s(maxLength=4000)}),command=False)
route(X,'/task-cards/{id}/decision','post',obj,o({'decision':s(enum=['needs_change','not_mine','unsure']),'note':s(maxLength=1000),'recordVersion':i(minimum=1),'contentHash':hs},['decision','recordVersion','contentHash']))
route(X,'/pulses','get',o({'pulses':a(r('ParticipantPulse'))}))
route(X,'/pulses/{id}','get',r('ParticipantPulse'))
# Pin the words path to the unmodified participant v1.3 submission contract.
participant=json.loads((ROOT/'contracts/companion-mobile.openapi.json').read_text())
for name, schema in participant['components']['schemas'].items():
 if name not in S:S[name]=schema
S['PulseSubmitResult']={**S['SubmitResult'],'properties':{**S['SubmitResult']['properties'],'requestId':s(pattern='^pulse:')}}
route(X,'/pulses/{id}/responses','post',r('PulseSubmitResult'),r('SubmitRequest'))
route(X,'/pulses/{id}/team-status','get',r('TeamStatus'))
route(X,'/meetings','get',o({'meetings':a(obj)}))
route(X,'/meetings/{id}','get',o({'id':uid,'title':s(),'outcome':s(),'headline':s(),'reason':s(),'hasBrief':b,'hasWrapUp':b}))
route(X,'/meetings/{id}/brief','get',o({'meetingId':uid,'title':s(),'durationMinutes':{'type':'number'},'purpose':s(),'expectedOutcome':s(),'whyYou':s(),'alreadyKnown':a(s()),'openQuestions':a(s()),'mayAskYou':a(s()),'whenLabel':s()}))
route(X,'/confirmations','get',o({'confirmations':a(obj)}))
route(X,'/confirmations/{id}','get',obj)
route(X,'/confirmations/{id}/items/{itemId}','post',obj,o({'decision':s(enum=['confirm','change','not_mine']),'note':s(maxLength=2000),'expectedVersion':i(minimum=1),'contentHash':hs},['decision','expectedVersion','contentHash']))
contract={'openapi':'3.1.0','info':{'title':'DutyGraph proposed mobile meetings and participant extras','version':'0.1.0','description':'Development-server contract. Not deployed in DutyGraph. Participant v1.3 is unchanged. All examples are fictional. Credentials and transcript text must never be logged.'},'servers':[{'url':'http://localhost:4417'}],'paths':paths,'components':{'securitySchemes':{'bearerAuth':{'type':'http','scheme':'bearer'}},'schemas':S}}
(ROOT/'contracts/meeting-mobile.openapi.json').write_text(json.dumps(contract,indent=2)+'\n')
print(f'Generated {sum(len(v) for v in paths.values())} operations.')
