/** Reviewed source expectations, fixed before execution. Never infer these
 * identities or the denominator from the result stream being checked. */
export function exactAssertions(rows:{label?:string;name?:string;ok:boolean}[],expected:readonly string[]):boolean{
 const actual=rows.map(r=>r.label??r.name);
 return actual.length===expected.length&&new Set(actual).size===actual.length&&expected.every(id=>actual.includes(id))&&rows.every(r=>r.ok===true);
}
export const controlsExpected=[
 'empty owner records fail explicit completeness','valid-line truncation cannot erase ledger ruling',
 'malformed owner record names exact line','unavailable owner records refuse current local claim',
 'formatted supported renderer version is recognized','old renderer without declaration remains version one',
 ...['3','2.5','"2"','2+1'].map(v=>'malformed renderer refused: export const LIST_RENDER_VERSION='+v+';'),
 'complete authentic ledger and canonical text pass','authentic ruling missing from ledger is refused',
 'authentic ruling missing from canonical text is refused','truncated authentic text is refused',
 'wrong part cannot satisfy exact owner ruling','authorized retired part preserves authentic ruling completeness',
 'unknown part remains refused even with matching ruling text','old removal protection remains',
 'old forged addition protection remains','settled item no longer displays a ruling wait',
 'unsettled item still displays its ruling wait','settled part wait omitted while sibling remains',
 'renderer preserves immutable waits and history','historical renderer remains explicit about archived waits',
 'actual pre41 tracked snapshot passes explicit historical comparison','historical CI check discloses private records were not checked',
 'all ten authentic retained choices recorded','all ten display owner retained wording',
 'Batch38 exact approval and provenance','Batch39 exact approval and provenance',
 'GroupD exact supplied decision and no fabricated acceptance',
];
export const wordExpected=[
 'master preserves exact approved paragraph','master company table does not cover series property',
 ...['fresh Word','committed Word'].flatMap(p=>[
  p+' preserves approved optional filing and series qualification',p+' company filing table is company-only',
  p+' preserves every sample signature word',p+' keeps the complete sample together and releases its final note',
 ]),'committed Word equals fresh generation in every OOXML part','ordinary quoted prose remains unchained','manual grouping does not alter the agreement profile',
];
export const billingExpected={
 obligations:[
  ...['nonpayment','inaccurate-contact','unlawful-use'].map(x=>x+' cannot sell a future year'),
  ...['submitted','filed','ended'].map(x=>'arrears when '+x+' settle without renewal'),
  'timely cancellation preserves genuine prior overdue fees','in-flight payment is reconciled before resignation',
  ...['portal','office'].map(x=>x+' cancellation after capture preserves notice and same payment fulfillment'),
  'new payment after timely notice remains refused including crafted resume',
  'unknown provider outcome resumes original payment before lifecycle changes','eligible debt card and separate resignation fee preserved',
 ],
 correspondence:[
  'decline stores portal link despite email failure','late reminder describes decline and passed deadline',
  'overdue retry does not promise a past payment deadline','paid previous anniversary sends recovered receipt once',
  'failed decline notice retries after earlier reminder succeeded','older decline delivery cannot acknowledge a newly queued receipt',
  'overdue unpaid reminder does not ask payment by past date','delayed decline names attempted card after saved-card replacement',
  'resumed automatic attempt retains original card identity after replacement','historical decline with unknown attempted card omits card identity',
 ],
};
export const recoveryExpected:Record<string,string[]>={
 source:[...['articles','psd'].flatMap(k=>['filing '+k+' replacement route succeeds','filing '+k+' prior legacy bytes preserved']),
 'filing obsolete unfinished snapshot starts fresh','package interrupted commit has independent intent',
 'package repeated replacement commits linked successors','package independent metadata excludes full questionnaire secrets',
 'package supersession does not label client deletion','package delayed abandoned upload removed again',
 'package lost committed response remains recoverable','package client deletion removes current primary and mirror',
 'package deleted copy remains eligible for delayed-upload cleanup','package concurrent replacement has one winner',
 'package client deletion beats concurrent prepared successor'],
 ...Object.fromEntries(['restore','deleted','second'].map(mode=>[mode,[
 'package '+mode+' restore succeeds',...['Plain','Live','Deleted'].map(n=>n==='Deleted'&&mode==='deleted'?'package later deletion defeats old snapshot':'package '+mode+' '+n+' latest retained package is usable'),
 ...['articles','psd'].map(k=>'filing '+mode+' '+k+' snapshot version restored'),
 'package client can delete recovered successor','package recovered system makes complete new backup']])),
 ...Object.fromEntries(['corrupt','pending','checkpoint'].map(mode=>[mode,[
 'package '+mode+' evidence refuses before rows','package '+mode+' refusal precedes primary-storage writes','package '+mode+' refusal is actionable']])),
};
