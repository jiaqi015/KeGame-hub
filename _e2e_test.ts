import type { OpenDayRawRow } from "./modules/open-day/domain/openDay.types.js";

async function main() {
  const catalog = new (await import("./modules/open-day/application/openDayCatalogService.js")).OpenDayCatalogService().execute();
  const defaultSkillId = catalog.defaultConfig.skillId || catalog.defaultConfig.formulaId;
  const { handleOpenDayScore } = await import("./modules/open-day/interfaces/http/openDayScoreHandler.js");

  const sizes = [100, 500, 1000, 2000, 5000];
  
  for (const n of sizes) {
    const rows: OpenDayRawRow[] = Array.from({length: n}, (_,i) => ({
      '大区': ['试点大区','朝阳','学院'][i%3],
      '小区': `小区-${i}`,
      '在售': String(Math.round(20+Math.random()*200)),
      '带看': String(Math.round(Math.random()*1500)),
      '成交': String(Math.round(Math.random()*30)),
      '好房': String(Math.round(Math.random()*20)),
    }));

    const payloadSize = JSON.stringify({rows}).length;
    const t0 = Date.now();
    const analysis = await handleOpenDayScore({
      rows, config: catalog.defaultConfig,
      mappings: { name:'小区', inventory:'在售', traffic:'带看', transactions:'成交', premium:'好房', area:'大区' },
      scenario: { skillId: defaultSkillId, formulaId: defaultSkillId, config: catalog.defaultConfig },
    });
    const ms = Date.now() - t0;
    const respSize = JSON.stringify(analysis).length;
    
    console.log(`${String(n).padEnd(5)} rows | POST ${String((payloadSize/1024).toFixed(1)).padStart(5)}KB | score ${String(ms).padStart(4)}ms | resp ${(respSize/1024).toFixed(0)}KB | ${analysis.meta.eligibleCount}/${analysis.meta.totalCount} elig`);
  }
}

main().catch(e => { console.error("💥", e.message); process.exit(1); });
