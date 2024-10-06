import { useEffect, useId, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import styles from "./style.module.css";
import { Bar } from 'react-chartjs-2';
import { BarController, BarElement, CategoryScale, Chart, LinearScale } from 'chart.js';
Chart.register(LinearScale, CategoryScale, BarController, BarElement);

const div = document.createElement('div');
document.body.appendChild(div);
createRoot(div).render(<App />);

interface AtkRoll {
    miss: number,
    hits: number,
    crits: number,
    surges: number
}

interface DefRoll {
    miss: number,
    blocks: number,
    surges: number
}

enum AtkSurge { None, Hit, Crit }

const SingleRoll: (r: RollConfig) => number = (r) => {
    const redRoll = E(r.redAtk, AtkDice.Red);
    const blackRoll = E(r.blackAtk, AtkDice.Black);
    const whiteRoll = E(r.whiteAtk, AtkDice.White);
    //losse dice types zijn belangrijk voor aims, verder niet
    //reroll atk dice step
    let roll: AtkRoll = applyAims(r, redRoll, blackRoll, whiteRoll);
    roll = criticalFilter(r, roll);
    roll = surgeTokenAtkFilter(r, roll);
    roll = surgeConversionAtk(r, roll);
    //dodge+cover step
    roll = coverFilter(r, roll);
    roll = shieldFilter(r, roll);
    roll = dodgeFilter(r, roll);
    //modify atk dice step
    roll = ramFilter(r, roll);
    roll = impactFilter(r, roll);
    roll = backupDef(r, roll);
    roll = armorFilter(r, roll);
    //roll def dice step
    let defRoll = defDice(roll.crits + roll.hits + r.dangerSense + (r.impervious ? r.pierce : 0), r.defDice);
    //reroll def dice step
    defRoll = uncannyLuckDef(r, defRoll);
    //modify def dice step
    defRoll = surgeTokenDef(r, defRoll);
    defRoll = surgeConversionDef(r, defRoll);
    defRoll = pierceDef(r, defRoll);
    return roll.crits + roll.hits - defRoll.blocks;
};

const applyAims = (roll: RollConfig, redRoll: AtkRoll, blackRoll: AtkRoll, whiteRoll: AtkRoll) => {
    if (roll.aims <= 0) {
        return {
            crits: redRoll.crits + blackRoll.crits + whiteRoll.crits,
            hits: redRoll.hits + blackRoll.hits + whiteRoll.hits,
            miss: redRoll.miss + blackRoll.miss + whiteRoll.miss,
            surges: redRoll.surges + blackRoll.surges + whiteRoll.surges,
        };
    }
    const rerollMax = 2 + roll.precise;
    //reroll logic
    //at that point, select up to rerollMax blank dice, starting with red, then black, then white
    //reroll these and come to a new roll
    //repeat until aims run out or no dice are black

    //determine number of surges left, to see if we should reroll them
    const surgeConversionLeft = roll.atkSurge !== AtkSurge.None ? 10000 : roll.critical + roll.atkSurges;
    let aims = roll.aims;
    //if no surge conversion applies at all, always reroll them
    //if surge conversion applies always, never reroll them
    //if surge conversion has a limit, reroll red first, then black, then white since better dice are more likely to become a hit
    while (aims > 0) {
        // at all times limit number of dice to reroll to rerollMax
        // potentialSurgesToReroll is a counter to determine how many surges we may want to reroll
        let potentialSurgesToReroll = Math.max(0, redRoll.surges + blackRoll.surges + whiteRoll.surges - surgeConversionLeft);
        let currentDiceRerolled = 0;
        let redMiss;
        let redSurge;
        let blackMiss;
        let blackSurge;
        let whiteMiss;
        let whiteSurge;

        //we reroll red misses, and if we want to reroll surges, also reroll at most that many red surges
        redMiss = Math.min(redRoll.miss, rerollMax - currentDiceRerolled);
        currentDiceRerolled += redMiss;
        if (potentialSurgesToReroll > 0) {
            redSurge = Math.min(Math.min(redRoll.surges, potentialSurgesToReroll), rerollMax - currentDiceRerolled);
            potentialSurgesToReroll -= redSurge;
        } else {
            redSurge = 0;
        }
        currentDiceRerolled += redSurge;

        //black
        blackMiss = Math.min(blackRoll.miss, rerollMax - currentDiceRerolled);
        currentDiceRerolled += blackMiss;
        if (potentialSurgesToReroll > 0) {
            blackSurge = Math.min(Math.min(blackRoll.surges, potentialSurgesToReroll), rerollMax - currentDiceRerolled);
            potentialSurgesToReroll -= blackSurge;
        } else {
            blackSurge = 0;
        }
        currentDiceRerolled += blackSurge;

        //white
        whiteMiss = Math.min(whiteRoll.miss, rerollMax - currentDiceRerolled);
        currentDiceRerolled += whiteMiss;
        if (potentialSurgesToReroll > 0) {
            whiteSurge = Math.min(Math.min(whiteRoll.surges, potentialSurgesToReroll), rerollMax - currentDiceRerolled);
            potentialSurgesToReroll -= whiteSurge;
        } else {
            whiteSurge = 0;
        }
        currentDiceRerolled += whiteSurge;

        //now we do the actual reroll
        redRoll.miss -= redMiss;
        redRoll.surges -= redSurge;
        blackRoll.miss -= blackMiss;
        blackRoll.surges -= blackSurge;
        whiteRoll.miss -= whiteMiss;
        whiteRoll.surges -= whiteSurge;
        const newRedRoll = E(redMiss + redSurge, AtkDice.Red);
        redRoll.crits += newRedRoll.crits;
        redRoll.hits += newRedRoll.hits;
        redRoll.miss += newRedRoll.miss;
        redRoll.surges += newRedRoll.surges;
        const newBlackRoll = E(blackMiss + blackSurge, AtkDice.Black);
        blackRoll.crits += newBlackRoll.crits;
        blackRoll.hits += newBlackRoll.hits;
        blackRoll.miss += newBlackRoll.miss;
        blackRoll.surges += newBlackRoll.surges;
        const newWhiteRoll = E(whiteMiss + whiteSurge, AtkDice.White);
        whiteRoll.crits += newWhiteRoll.crits;
        whiteRoll.hits += newWhiteRoll.hits;
        whiteRoll.miss += newWhiteRoll.miss;
        whiteRoll.surges += newWhiteRoll.surges;
        aims--;
    }
    //extra option: consider armor
    return {
        crits: redRoll.crits + blackRoll.crits + whiteRoll.crits,
        hits: redRoll.hits + blackRoll.hits + whiteRoll.hits,
        miss: redRoll.miss + blackRoll.miss + whiteRoll.miss,
        surges: redRoll.surges + blackRoll.surges + whiteRoll.surges,
    };
};

const coverFilter: AttackFilter = (r, a) => {
    //determine the cover
    if (r.blast) {
        return a;
    }
    const c = r.cover - r.sharpShooter;
    if (c <= 0) {
        return a;
    }
    if (a.hits === 0) {
        return a;
    }
    const toRoll = a.hits - (r.lowProfile ? 1 : 0);
    const roll = defDice(toRoll, false);
    if (r.lowProfile) {
        roll.blocks++;
    }
    if (c === 1) {
        return { ...a, hits: a.hits - roll.blocks };
    }
    return { ...a, hits: a.hits - roll.blocks - roll.surges };
};

const shieldFilter: AttackFilter = (r, a) => {
    const copy = { ...a };
    let remainingShields = r.shields;
    if (remainingShields >= a.crits) {
        remainingShields -= copy.crits;
        copy.crits = 0;
        if (remainingShields >= copy.hits) {
            copy.hits = 0;
        } else {
            copy.hits -= remainingShields;
        }
    } else {
        copy.crits -= remainingShields;
    }
    return copy;
}

const dodgeFilter: AttackFilter = (r, a) => {
    if (r.highVelocity) {
        return a;
    }
    if (r.dodges >= a.hits) {
        return { ...a, hits: 0 };
    } else {
        return { ...a, hits: a.hits - r.dodges };
    }
}

const ramFilter: AttackFilter = (r, a) => {
    let ramRemaining = r.ram;
    const copy = { ...a };
    if (copy.miss >= ramRemaining) {
        copy.crits += ramRemaining;
        copy.miss -= ramRemaining;
    } else {
        copy.crits += copy.miss;
        ramRemaining -= copy.miss;
        copy.miss = 0;
        if (copy.surges >= ramRemaining) {
            copy.crits += ramRemaining;
            copy.surges -= ramRemaining;
        } else {
            copy.crits += copy.surges;
            ramRemaining -= copy.surges;
            copy.surges = 0;
            if (copy.hits >= ramRemaining) {
                copy.crits += ramRemaining;
                copy.hits -= ramRemaining;
            } else {
                copy.crits += copy.hits;
                copy.hits = 0;
            }
        }
    }
    return copy;
}

const impactFilter: AttackFilter = (r, a) => {
    if (r.armor === 0) {
        return a;
    }
    if (a.hits >= r.impact) {
        return { ...a, crits: a.crits + r.impact, hits: a.hits - r.impact };
    }
    return { ...a, crits: a.crits + a.hits, hits: 0 };
};

const armorFilter: AttackFilter = (r, a) => {
    if (r.armor === 0) {
        return a;
    }
    if (a.hits <= r.armor) {
        return { ...a, hits: 0 };
    }
    return { ...a, hits: a.hits - r.armor };
};

type AttackFilter = (r: RollConfig, a: AtkRoll) => AtkRoll;

const criticalFilter: AttackFilter = (r, a) => {
    if (r.critical === 0 || a.surges === 0) {
        return a;
    }
    const copy = { ...a };
    if (r.critical >= a.surges) {
        copy.crits += a.surges;
        copy.surges = 0;
    } else {
        copy.crits += r.critical;
        copy.surges -= r.critical;
    }
    return copy;
}

const surgeTokenAtkFilter: AttackFilter = (r, a) => {
    if (r.atkSurges === 0 || a.surges === 0) {
        return a;
    }
    const copy = { ...a };
    if (r.atkSurges >= a.surges) {
        copy.hits += a.surges;
        copy.surges = 0;
    } else {
        copy.hits += r.atkSurges;
        copy.surges -= r.atkSurges;
    }
    return copy;
}

const surgeConversionAtk: AttackFilter = (r, a) => {
    const copy = { ...a };
    switch (r.atkSurge) {
        case AtkSurge.None:
            copy.miss += copy.surges;
            copy.surges = 0;
            break;
        case AtkSurge.Hit:
            copy.hits += copy.surges;
            copy.surges = 0;
            break;
        case AtkSurge.Crit:
            copy.crits += copy.surges;
            copy.surges = 0;
            break;
    }
    return copy;
}

type DefFilter = (r: RollConfig, a: DefRoll) => DefRoll;

const backupDef: AttackFilter = (r, a) => {
    if (!r.backup) {
        return a;
    }
    return { ...a, hits: Math.max(0, a.hits - 2) };
};

const uncannyLuckDef: DefFilter = (r, a) => {
    const maxReroll = r.uncannyLuck;
    const surgeConversionLeft = r.defSurge ? 10000 : r.defSurgeTokens;
    const missReroll = Math.min(a.miss, maxReroll);
    const surgeReroll = Math.min(Math.max(0, a.surges - surgeConversionLeft), maxReroll - missReroll);
    a.miss -= missReroll;
    a.surges -= surgeReroll;
    const reroll = defDice(missReroll + surgeReroll, r.defDice);
    a.blocks += reroll.blocks;
    a.miss += reroll.miss;
    a.surges += reroll.surges;
    return a;
}

const surgeConversionDef: DefFilter = (r, a) => {
    const copy = { ...a };
    if (r.defSurge) {
        copy.blocks += copy.surges;
        copy.surges = 0;
    }
    return copy;
}

const surgeTokenDef: DefFilter = (r, a) => {
    if (r.defSurgeTokens >= a.surges) {
        return { ...a, blocks: a.blocks + a.surges, surges: 0 };
    }
    return { ...a, blocks: a.blocks + r.defSurgeTokens, surges: a.surges - r.defSurgeTokens };
};

const pierceDef: DefFilter = (r, a) => {
    if (a.blocks <= r.pierce) {
        return { ...a, blocks: 0 };
    }
    return { ...a, blocks: a.blocks - r.pierce };
};

enum AtkDice { Red, Black, White };

const E = (x: number, tp: AtkDice) => {
    const result: AtkRoll = {
        crits: 0,
        hits: 0,
        miss: 0,
        surges: 0
    }
    let hitCount = 0;
    switch (tp) {
        case AtkDice.Red:
            hitCount = 5;
            break;
        case AtkDice.Black:
            hitCount = 3;
            break;
        case AtkDice.White:
            hitCount = 1;
            break;
    }
    for (let i = 0; i < x; i++) {
        const r = R(8);
        if (r < hitCount) {
            result.hits++;
        } else if (r < hitCount + 1) {
            result.crits++;
        } else if (r < hitCount + 2) {
            result.surges++;
        } else {
            result.miss++;
        }
    }
    return result;
}

const defDice = (x: number, tp: boolean) => {
    const result: DefRoll = {
        blocks: 0,
        miss: 0,
        surges: 0
    }
    const hitCount = tp ? 3 : 1;
    for (let i = 0; i < x; i++) {
        const r = R(6);
        if (r < hitCount) {
            result.blocks++;
        } else if (r < hitCount + 1) {
            result.surges++;
        } else {
            result.miss++;
        }
    }
    return result;
}

const R: (limit: number) => number = (l) => {
    const n = Math.floor(Math.random() * l);
    return n;
};

interface Summary {
    average: number,
    spread: number[];
}

const summarize = (r: number[]) => {
    const total = r.reduce((prev, current) => prev + current, 0);
    const average = total / (Math.max(r.length, 1));
    const max = Math.max(...r);
    const spread: number[] = [];
    for (let i = 0; i <= max; i++) {
        spread.push(0);
    }
    for (const roll of r) {
        spread[roll]++;
    }
    return { average: average, spread: spread };
};

interface RollConfig {
    redAtk: number,
    blackAtk: number,
    whiteAtk: number,
    atkSurge: AtkSurge,
    critical: number,
    atkSurges: number,
    aims: number,
    precise: number,
    sharpShooter: number,
    blast: boolean,
    highVelocity: boolean,
    ram: number,
    impact: number,
    pierce: number,

    cover: number,
    lowProfile: boolean,
    shields: number,
    dodges: number,
    armor: number,
    defDice: boolean,
    defSurge: boolean,
    defSurgeTokens: number,
    dangerSense: number,
    uncannyLuck: number,
    impervious: boolean,
    backup: boolean,
}

function App() {
    const [config, setConfig] = useState<RollConfig>({
        armor: 0,
        aims: 0,
        precise: 0,
        atkSurge: AtkSurge.None,
        atkSurges: 0,
        blackAtk: 0,
        blast: false,
        backup: false,
        cover: 0,
        critical: 0,
        dangerSense: 0,
        defDice: false,
        defSurge: false,
        defSurgeTokens: 0,
        dodges: 0,
        highVelocity: false,
        impact: 0,
        impervious: false,
        lowProfile: false,
        pierce: 0,
        ram: 0,
        redAtk: 3,
        sharpShooter: 0,
        shields: 0,
        whiteAtk: 0,
        uncannyLuck: 0,
    });
    const [result, setResult] = useState<number[]>([]);
    useEffect(() => {
        const results: number[] = [];
        for (let i = 0; i < 10000; i++) {
            results.push(SingleRoll(config));
        }
        setResult(results);
    }, [config]);
    const summarized = useMemo(() => summarize(result), [result]);
    return <div style={{display: 'flex', flexDirection: "row"}}>
        <div className={styles.config}>
            <div>This code will simulate 10000 attack rolls with the given dice and modifications to come to a concrete result. The shown result automatically updates when you change the configuration.</div>
            <hr></hr>
            <div style={{
                display: "flex", justifyContent: "space-between"
            }}>
                <NumInput v={config.redAtk} setV={(v) => setConfig(prev => { return { ...prev, redAtk: v } })} label="Red" />
                <NumInput v={config.blackAtk} setV={(v) => setConfig(prev => { return { ...prev, blackAtk: v } })} label="Black" />
                <NumInput v={config.whiteAtk} setV={(v) => setConfig(prev => { return { ...prev, whiteAtk: v } })} label="White" />
            </div>
            <div id="attack-advanced" style={{ display: "flex", flexDirection: "column", maxWidth: "20vw" }}>
                <h2>Attack modifications</h2>
                <div className={styles.between}>
                    <label htmlFor="atkSurge">Convert surges to</label>
                    <select id="atkSurge" onChange={(e) => setConfig(prev => {
                        let surge: AtkSurge = AtkSurge.None;
                        switch (e.target.value) {
                            case "0":
                                surge = AtkSurge.None;
                                break;
                            case "1":
                                surge = AtkSurge.Hit;
                                break;
                            case "2":
                                surge = AtkSurge.Crit;
                                break;
                        }
                        return { ...prev, atkSurge: surge };
                    })}>
                        <option value="0">None</option>
                        <option value="1">Hit</option>
                        <option value="2">Crit</option>
                    </select>
                </div>
                <NumInput v={config.aims} setV={(v) => setConfig(prev => { return { ...prev, aims: v } })} label="Aim tokens" />
                <NumInput v={config.precise} setV={(v) => setConfig(prev => { return { ...prev, precise: v } })} label="Precise X" />
                <NumInput v={config.atkSurges} setV={(v) => setConfig(prev => { return { ...prev, atkSurges: v } })} label="Surge tokens" />
                <NumInput v={config.critical} setV={(v) => setConfig(prev => { return { ...prev, critical: v } })} label="Critical X" />
                <NumInput v={config.pierce} setV={(v) => setConfig(prev => { return { ...prev, pierce: v } })} label="Pierce X" />
                <NumInput v={config.impact} setV={(v) => setConfig(prev => { return { ...prev, impact: v } })} label="Impact X" />
                <NumInput v={config.ram} setV={(v) => setConfig(prev => { return { ...prev, ram: v } })} label="Ram X" />
                <NumInput v={config.sharpShooter} setV={(v) => setConfig(prev => { return { ...prev, sharpShooter: v } })} label="Sharpshooter X" />
                <div className={styles.between}>
                    <label htmlFor="blast">Blast</label>
                    <input id="blast" type="checkbox" checked={config.blast} onChange={(e) => setConfig(prev => { return { ...prev, blast: e.target.checked } })} />
                </div>                    <div className={styles.between}>
                    <label htmlFor="highvelocity">High Velocity</label>
                    <input id="highvelocity" type="checkbox" checked={config.highVelocity} onChange={(e) => setConfig(prev => { return { ...prev, highVelocity: e.target.checked } })} />
                </div></div>
            <hr></hr>
            <div id="defense">
                <h2>Defense modifications</h2>
                <div className={styles.between}>
                    <label htmlFor="defense-type">Defend with</label>
                    <select id="defense-type" onChange={(e) => {
                        setConfig(prev => { return { ...prev, defDice: e.target.value === "1" } });
                    }}>
                        <option value="0">White</option>
                        <option value="1">Red</option>
                    </select>
                </div>
                <div className={styles.between}>
                    <label htmlFor="def-surge">Convert surges</label>
                    <input id="def-surge" type="checkbox" checked={config.defSurge} onChange={(e) => setConfig(prev => { return { ...prev, defSurge: e.target.checked } })} />
                </div><NumInput v={config.dodges} setV={(v) => setConfig(prev => { return { ...prev, dodges: v } })} label="Dodge tokens" />
                <NumInput v={config.shields} setV={(v) => setConfig(prev => { return { ...prev, shields: v } })} label="Shield tokens" />
                <NumInput v={config.defSurgeTokens} setV={(v) => setConfig(prev => { return { ...prev, defSurgeTokens: v } })} label="Surge tokens" />
                <NumInput v={config.cover} setV={(v) => setConfig(prev => { return { ...prev, cover: v } })} label="Cover X" />
                <NumInput v={config.armor} setV={(v) => setConfig(prev => { return { ...prev, armor: v } })} label="Armor X" />
                <NumInput v={config.dangerSense} setV={(v) => setConfig(prev => { return { ...prev, dangerSense: v } })} label="Danger sense X" />
                <NumInput v={config.uncannyLuck} setV={(v) => setConfig(prev => { return { ...prev, uncannyLuck: v } })} label="Uncanny luck X" />
                <label htmlFor="low-profile">Low profile</label>
                <input id="low-profile" type="checkbox" checked={config.lowProfile} onChange={(e) => setConfig(prev => { return { ...prev, lowProfile: e.target.checked } })} />
                <label htmlFor="impervious">Impervious</label>
                <input id="impervious" type="checkbox" checked={config.impervious} onChange={(e) => setConfig(prev => { return { ...prev, impervious: e.target.checked } })} />
                <label htmlFor="backup">Backup</label>
                <input id="backup" type="checkbox" checked={config.backup} onChange={(e) => setConfig(prev => { return { ...prev, backup: e.target.checked } })} />
            </div>
            <hr></hr>
        </div>
        <div className={styles.results}>
            The average number of wounds on this attack is {summarized.average}.
            <Bar data={{labels: summarized.spread.map((_, i) => `${i}`),
                datasets: [{
                    label: '# of Wounds',
                    data: summarized.spread.map(i => i / result.length),
                    borderWidth: 1
                }]}}
                options={{scales: {y: {beginAtZero: true}}}} />
        </div>
    </div>;
};

//add the spread of results

const NumInput = ({ v, setV, label }: { v: number, setV: (v: number) => void, label: string }) => {
    const id = useId();
    return <div className={styles.between}>
        <label htmlFor={id}>{label}</label>
        <input type="number" min="0" max="50" value={v} onChange={(e) => isNaN(e.target.valueAsNumber) ? setV(0) : setV(e.target.valueAsNumber)} />
    </div>;
};
