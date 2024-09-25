import { StrictMode, startTransition, useEffect, useId, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

        const div = document.createElement('div');
        document.body.appendChild(div);
        createRoot(div).render(<App/>);




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

enum AtkSurge {None, Hit, Crit}

const SingleRoll : (r : RollConfig) => number = (r) =>  {
    const redRoll = E(r.redAtk, AtkDice.Red);
    const blackRoll = E(r.blackAtk, AtkDice.Black);
    const whiteRoll = E(r.whiteAtk, AtkDice.White);
    //losse dice types zijn belangrijk voor aims, verder niet

    let roll : AtkRoll = {
        crits: redRoll.crits + blackRoll.crits + whiteRoll.crits,
        hits: redRoll.hits + blackRoll.hits + whiteRoll.hits,
        miss: redRoll.miss + blackRoll.miss + whiteRoll.miss,
        surges: redRoll.surges + blackRoll.surges + whiteRoll.surges,
    };
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
    roll = armorFilter(r, roll);
    //roll def dice step
    let defRoll = defDice(roll.crits + roll.hits + r.dangerSense + (r.impervious ? r.pierce : 0), r.defDice);
    defRoll = surgeTokenDef(r, defRoll);
    defRoll = surgeConversionDef(r, defRoll);
    defRoll = pierceDef(r, defRoll);
    return roll.crits + roll.hits - defRoll.blocks;
};

const coverFilter: AttackFilter = (r,a ) => {
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
    if (c === 1) {
        return {...a, hits: a.hits - roll.blocks};
    }
    return {...a, hits: a.hits - roll.blocks - roll.surges};
};

const shieldFilter: AttackFilter = (r,a) => {
    const copy = {...a};
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

const dodgeFilter: AttackFilter = (r,a) => {
    if (r.highVelocity) {
        return a;
    }
    if (r.dodges >= a.hits) {
        return {...a, hits: 0};
    } else {
        return {...a, hits: a.hits - r.dodges};
    }
}

const ramFilter: AttackFilter = (r,a) => {
    let ramRemaining = r.ram;
    const copy = {...a};
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

const impactFilter: AttackFilter = (r,a) => {
    if (r.armor === 0) {
        return a;
    }
    if (a.hits >= r.impact) {
        return {...a, crits: a.crits + r.impact, hits: a.hits - r.impact};
    }
    return {...a, crits: a.crits + a.hits, hits: 0};
};

const armorFilter: AttackFilter = (r,a) => {
    if (r.armor === 0) {
        return a;
    }
    if (a.hits <= r.armor) {
        return {...a, hits: 0};
    }
    return {...a, hits: a.hits - r.armor};
};

type AttackFilter = (r: RollConfig, a: AtkRoll) => AtkRoll;

const criticalFilter: AttackFilter = (r, a) => {
    if (r.critical === 0 || a.surges === 0) {
        return a;
    }
    const copy = {...a};
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
    const copy = {...a};
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
    const copy = {...a};
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

const surgeConversionDef: DefFilter = (r, a) => {
    const copy = {...a};
    if (r.defSurge) {
        copy.blocks += copy.surges;
        copy.surges = 0;
    }
    return copy;
}

const surgeTokenDef: DefFilter = (r,a) => {
    if (r.defSurgeTokens >= a.surges) {
        return {...a, blocks: a.blocks + a.surges, surges: 0};
    }
    return {...a, blocks: a.blocks + r.defSurgeTokens, surges: a.surges - r.defSurgeTokens};
};

const pierceDef: DefFilter = (r,a) => {
    if (a.blocks <= r.pierce) {
        return {...a, blocks: 0};
    }
    return {...a, blocks: a.blocks - r.pierce};
};

enum AtkDice { Red, Black, White};

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
    for (let i =0 ; i < x ; i++) {
        const r = R(8);
        if (r < hitCount){
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
    const hitCount =  tp ? 3 : 1;
    for (let i = 0 ; i < x ; i++) {
        const r = R(6);
        if (r < hitCount){
            result.blocks++;
        } else if (r < hitCount + 1) {
            result.surges++;
        } else {
            result.miss++;
        }
    }
    return result;
}

const R : (limit: number) => number = (l) =>  {
    const n = Math.floor(Math.random() * l);
    return n;
};

const summarize = (r : number[]) => {
    const total = r.reduce((prev, current) => prev + current, 0);
    const average = total / (Math.max(r.length, 1));
    return average;
};

interface RollConfig {
    redAtk: number,
    blackAtk: number,
    whiteAtk: number,
    atkSurge: AtkSurge,
    critical: number,
    atkSurges: number,
    sharpShooter: number,
    blast: boolean,
    highVelocity: boolean,
    ram: number,
    impact: number,
    pierce: number,

    cover: 0 | 1| 2,
    lowProfile: boolean,
    shields: number,
    dodges: number,
    armor: 0| 1|2|3|4|5,
    defDice: boolean,
    defSurge: boolean,
    defSurgeTokens: number,
    dangerSense: number,
    impervious: boolean,
}

function App() {
    const [config, setConfig] = useState<RollConfig>({
        armor:0,
        atkSurge: AtkSurge.None,
        atkSurges: 0,
        blackAtk: 0,
        blast: false,
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
        whiteAtk: 0
    });
    const [result, setResult] = useState<number[]>([]);
    const summarized = useMemo(() => summarize(result), [result]);
    return <div>
        <div className="config">
            <div>
            <NumInput v={config.redAtk} setV={(v) => setConfig(prev => {return {...prev, redAtk: v}})} label="Red"/>
            <NumInput v={config.blackAtk} setV={(v) => setConfig(prev => {return {...prev, blackAtk: v}})} label="Black"/>
            <NumInput v={config.whiteAtk} setV={(v) => setConfig(prev => {return {...prev, whiteAtk: v}})} label="White"/>
            </div>
            <div id="attack-advanced">
                <label htmlFor="atkSurge">Convert surges to</label>
                <select id="atkSurge" onChange={(e) => setConfig(prev => {
                    let surge: AtkSurge = AtkSurge.None;
                    switch (e.target.value){
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
                    return {...prev, atkSurge: surge};
                    })}>
                    <option value="0">None</option>
                    <option value="1">Hit</option>
                    <option value="2">Crit</option>
                </select>
                <NumInput v={config.atkSurges} setV={(v) => setConfig(prev => {return {...prev, atkSurges: v}})} label="Surge tokens"/>
                <NumInput v={config.critical} setV={(v) => setConfig(prev => {return {...prev, critical: v}})} label="Critical X"/>
                <NumInput v={config.pierce} setV={(v) => setConfig(prev => {return {...prev, pierce: v}})} label="Pierce X"/>
                <NumInput v={config.impact} setV={(v) => setConfig(prev => {return {...prev, impact: v}})} label="Impact X"/>
                <NumInput v={config.ram} setV={(v) => setConfig(prev => {return {...prev, ram: v}})} label="Ram X"/>
                <NumInput v={config.sharpShooter} setV={(v) => setConfig(prev => {return {...prev, sharpShooter: v}})} label="Sharpshooter X"/>
                <label htmlFor="blast">Blast</label>
                <input id="blast" type="checkbox" checked={config.blast} onChange={(e) => setConfig(prev => {return {...prev, blast: e.target.checked}})}/>
                <label htmlFor="highvelocity">High Velocity</label>
                <input id="highvelocity" type="checkbox" checked={config.highVelocity} onChange={(e) => setConfig(prev => {return {...prev, highVelocity: e.target.checked}})}/>
            </div>
            <div id="defense">
                <label htmlFor="defense-type">Defend with</label>
                <select id="defense-type" onChange={(e) => {
                    setConfig(prev => {return {...prev, defDice: e.target.value === "1"}});
                }}>
                    <option value="0">White</option>
                    <option value="1">Red</option>
                </select>
                <label htmlFor="def-surge">Convert surges</label>
                <input id="def-surge" type="checkbox" checked={config.defSurge} onChange={(e) => setConfig(prev => {return {...prev, defSurge: e.target.checked}})}/>
            </div>
        </div>
        <button onClick={(e) => {
            console.log(config);
            const results: number[] = [];
            for (let i = 0; i< 10000; i++){
                results.push(SingleRoll(config));
            }
            setResult(results);
        }}>Roll</button>
        <div className="results">
            {summarized}
        </div>
    </div>;
};

const NumInput = ({v, setV, label}: {v: number, setV: (v: number) => void, label: string}) => {
    const id = useId();
    return <>
        <label htmlFor={id}>{label}</label>
        <input type="number" min="0" max="50" value={v} onChange={(e) => isNaN(e.target.valueAsNumber) ? setV(0) : setV(e.target.valueAsNumber)}/>
    </>;
};
