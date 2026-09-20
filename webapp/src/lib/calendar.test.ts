import { anticipatedFilingDay, closestEffectiveDate, effectiveDateRange, easternToday, formatCalendarDate, isBankingDay, validCalendarDate } from './calendar';
import { formatDate } from './datetime';
import { buildFinalLlcName, nameContainsLegalDesignator, typedDesignatorProblem, hasProtectedSeriesPhrase, canonicalizeSeriesName, seriesDedupeKey, validateEffectiveDate } from '../components/forms/florida-llc/validation';
const equal=(a:unknown,b:unknown,label:string)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${label}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);};
for(const zone of ['America/New_York','America/Chicago','America/Los_Angeles','Pacific/Honolulu','Asia/Tokyo','UTC']){
 process.env.TZ=zone;
 equal(easternToday(new Date('2026-09-20T01:00:00Z')),'2026-09-19',zone+' Eastern midnight');
 equal(anticipatedFilingDay(new Date('2026-09-04T15:00:00Z')),'2026-09-08',zone+' Friday before Labor Day');
 equal(anticipatedFilingDay(new Date('2026-12-31T15:00:00Z')),'2027-01-04',zone+' year rollover');
 equal(effectiveDateRange('2026-09-16'),{earliest:'2026-09-09',latest:'2026-12-15'},zone+' endpoints');
 equal(effectiveDateRange('2026-09-09').earliest,'2026-09-01',zone+' Labor Day lookback');
 equal(effectiveDateRange('2026-03-10').earliest,'2026-03-03',zone+' spring DST');
 equal(closestEffectiveDate('2020-01-01','2026-09-16'),'2026-09-09',zone+' clamp early');
 equal(closestEffectiveDate('2030-01-01','2026-09-16'),'2026-12-15',zone+' clamp late');
 equal(closestEffectiveDate('2026-10-01','2026-09-16'),'2026-10-01',zone+' preserve within range');
 equal(validateEffectiveDate('2026-09-09',new Date('2026-09-16T16:00:00Z')),null,zone+' earliest accepted');
 equal(!!validateEffectiveDate('2026-12-16',new Date('2026-09-16T16:00:00Z')),true,zone+' day91 outside');
 equal(formatDate('2026-09-20T01:00:00Z'),'September 19, 2026',zone+' timestamp');
 equal(formatDate('2026-10-01'),'October 1, 2026',zone+' calendar only');
}
for(const day of ['2026-01-01','2026-01-19','2026-02-16','2026-05-25','2026-06-19','2026-09-07','2026-10-12','2026-11-11','2026-11-26','2026-12-25','2027-07-05'])equal(isBankingDay(day),false,day+' holiday');
equal(isBankingDay('2026-07-03'),true,'Banks open Friday before Saturday holiday');
equal(isBankingDay('2027-06-18'),true,'Banks open Friday before Saturday Juneteenth');
for(const d of ['2026-02-30','2026-13-01','2026-00-10','0000-01-01','not-a-date'])equal(validCalendarDate(d),false,'invalid '+d);
equal(validCalendarDate('2028-02-29'),true,'leap date');equal(formatCalendarDate('2028-02-29'),'February 29, 2028','leap display');
for(const n of ['Millcreek Holdings','Hillcrest Rentals','Wellcome Farms','Fullcircle Properties','Millc']){equal(nameContainsLegalDesignator(n),false,n);equal(buildFinalLlcName(n,'LLC'),n+', LLC',n+' suffix');}
for(const n of ['Acme, LLC','Acme L.L.C.','Acme Limited Liability Company','Acme, PLLC','Acme P.L.L.C.','Acme Professional Limited Liability Company'])equal(nameContainsLegalDesignator(n),true,n);
equal(!!typedDesignatorProblem('Acme PLLC','DOMESTIC_LLC'),true,'professional mismatch');equal(!!typedDesignatorProblem('Acme LLC','PLLC'),true,'ordinary mismatch');
for(const n of ['PS-4','PS 4','P.S. 4','Protected Series-4']){equal(hasProtectedSeriesPhrase(n),true,n);equal(seriesDedupeKey(n),'4',n+' duplicate');equal(canonicalizeSeriesName(canonicalizeSeriesName(n)),canonicalizeSeriesName(n),n+' stable');}
equal(seriesDedupeKey('PS A-B')===seriesDedupeKey('PS A B'),false,'unrelated hyphen retained');equal(hasProtectedSeriesPhrase('SHOPS 4'),false,'substring not PS');
console.log('Batch 10 calendar/name checks passed in six time zones.');
