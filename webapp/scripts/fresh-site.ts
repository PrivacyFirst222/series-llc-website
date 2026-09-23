import {resolve} from 'node:path';
import {buildSite} from './isolated-stack';
/** Always rebuild; neither existence nor timestamps prove source identity. */
export async function freshSite(cwd:string):Promise<void>{
 await buildSite(cwd,resolve(cwd,'dist'),false);
}
