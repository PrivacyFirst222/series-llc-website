import {PDFDocument,StandardFonts} from '@cantoo/pdf-lib';
import {drawnWidth,wrapSegs,type Fonts} from './pdf-render';
import {ACKNOWLEDGMENTS} from './order-summary';
import {AGENT_FORM_VERSION,AGENT_PERSONAL_SERIES_AGREEMENT,AGENT_SERIES_AGREEMENT} from '../src/components/forms/florida-llc/registeredAgent';
import {buildPayload} from '../src/components/forms/florida-llc/buildPayload';
import {defaultFormData} from '../src/components/forms/florida-llc/defaults';
const rows:{label:string;ok:boolean;detail?:unknown}[]=[];
const check=(label:string,ok:boolean,detail?:unknown)=>rows.push({label,ok,detail});
const doc=await PDFDocument.create();const fonts:Fonts={regular:await doc.embedFont(StandardFonts.TimesRoman),bold:await doc.embedFont(StandardFonts.TimesRomanBold),italic:await doc.embedFont(StandardFonts.TimesRomanItalic),boldItalic:await doc.embedFont(StandardFonts.TimesRomanBoldItalic)};
for(const width of [120,468])for(const bold of [false,true]) {
 const text='W'.repeat(230);const lines=wrapSegs(fonts,[{text,bold,italic:false}],width,11);
 check(`long token stays inside ${width}pt with bold=${bold}`,lines.every(l=>l.reduce((n,s)=>n+drawnWidth(s.bold?fonts.bold:fonts.regular,s.text,11),0)<=width+0.001));
 check(`long token keeps every character ${width}/${bold}`,lines.flat().map(s=>s.text).join('')===text);
}
const ack=ACKNOWLEDGMENTS.find(a=>a.field==='registeredAgentSeriesAgreementAcknowledgment')!;
for(const [path,version,expected] of [['NEW',AGENT_FORM_VERSION,AGENT_PERSONAL_SERIES_AGREEMENT],['CONVERT',AGENT_FORM_VERSION,AGENT_SERIES_AGREEMENT],['NEW','legacy',AGENT_SERIES_AGREEMENT]] as const) {
 const p=buildPayload({...structuredClone(defaultFormData),filingPath:path,registeredAgentChoice:'SELF'});p.metadata.formVersion=version;
 check(`summary consent matches ${path}/${version}`,typeof ack.text==='function'&&ack.text(p)===expected);
}
console.log('B37UNIT:'+JSON.stringify(rows));process.exitCode=rows.some(r=>!r.ok)?1:0;
