import { StrictMode, startTransition, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import styles from './style.module.css';

const prefix = '/complete/music/';

async function loadDir(path: string): Promise<string[]> {
    const call = await fetch(path);
    const html = await call.text();
    const dom = new DOMParser().parseFromString(html, "text/html");
    const items = dom.querySelectorAll("a");
    const result: string[] = [];
    const promises: Promise<any>[] = [];
    for (let i = 0; i < items.length; i++) {
        const link = path + items.item(i).getAttribute('href');
        if (link.endsWith("../")) {
            continue;
        }
        if (link.endsWith('/')) {
            promises.push(loadDir(link).then(v => result.push(...v)));
        } else {
            result.push(decodeURI(link));
        }
    }
    await Promise.all(promises);
    return result;
}

loadDir(prefix)
    .then(files => {
        const div = document.createElement('div');
        document.body.appendChild(div);
        const parsed = files.filter(file => file.endsWith('.flac') || file.endsWith('.mp3'))
            .map(file => {
                const withoutPrefix = file.substring(prefix.length);
                const [fileArtist, fileAlbum, fileName] = withoutPrefix.split("/", 3);
            const name = fileName.substring(0, fileName.lastIndexOf('.'));
            const s: Song = { name: name, album: fileAlbum, artist: fileArtist, total: withoutPrefix };
            return s;
        });
        createRoot(div).render(<Application files={shuffle(parsed)} />);
    });

const Application = ({ files }: { files: Song[] }) => {
    const [playlist, setPlaylist] = useState<Song[]>(files.slice(0, 300));
    const [current, setCurrent] = useState<number>(0);
    return <StrictMode>
        <button onClick={(e) => setPlaylist(shuffle(files).slice(0,300))}>Play random</button>
        <div style={{height: '500px', display: 'flex', overflow: 'scroll'}}>
        <table style={{height: '500px'}}>
                {playlist.map((song, index) => <tr key={song.total} onClick={(e) => setCurrent(index)} style={{ cursor: 'pointer'}}>
                <td>{index == current ? '>' : ''}</td>
                    <td>{song.artist}</td>
                    <td>{song.album}</td>
                    <td>{song.name}</td>
                    <td onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPlaylist(prev => prev.filter(s => s.total !== song.total)) }}>X</td>
            </tr>)}
            </table></div>
        <audio controls src={`${prefix}${encodeURI(playlist.at(current)?.total) ?? ''}`} autoPlay onEnded={(e) => setCurrent(prev => prev + 1)}></audio>
        <Searcher addToList={(file) => setPlaylist(file)} files={files}></Searcher>
    </StrictMode>
};

type Adder = (file: Song[]) => void

interface Song {
    name: string,
    album: string,
    artist: string,
    total: string
}

const Searcher = ({ addToList, files }: { addToList: Adder, files: Song[] }) => {
    const [search, setSearch] = useState(''); 
    const [filteredFiles, setFilteredFiles] = useState<Song[]>([]);
    useEffect(() => {
        if (search === '') {
            setFilteredFiles([]);
            return;
        }
        const newFilter = files.filter(file => {
            return file.artist.toLowerCase().includes(search) && file.album.toLowerCase().includes(search) && file.name.toLowerCase().includes(search);
        });
        newFilter.sort();
        setFilteredFiles(newFilter);
    }, [search, files]);
    return <>
        <div>
            <label htmlFor='search'>Artist</label>
            <input type='text' id='searcj' value={search} onChange={(e) => setSearch(e.target.value)}></input>
        </div>
        <div>
            <SearchResults songs={filteredFiles} addToList={addToList}></SearchResults>
        </div>
    </>
}

const SearchResults = ({ songs, addToList }: { songs: Song[], addToList: Adder }) => {
    const artists = useMemo(() => groupBy(songs, s => s.artist), [songs]);
    const albums = useMemo(() => groupBy(songs, s => s.album), [songs]);
    const names = useMemo(() => groupBy(songs, s => s.name), [songs]);
    const artistNodes: JSX.Element[] = [];
    for (const [key, value] of artists.entries()) {
        artistNodes.push(<div key={key} className={styles.horizontalBar}>
            {key}
            <button onClick={(e) => addToList(shuffle(value))}>Play all</button>
        </div>);
    }
    const albumNodes: JSX.Element[] = [];
    for (const [key, value] of albums.entries()) {
        albumNodes.push(<div key={key} className={styles.horizontalBar}>
            {key}
            <button onClick={(e) => addToList(shuffle(value))}>Play</button>
        </div>);
    }
    const nameNodes: JSX.Element[] = [];
    for (const [key, value] of names.entries()) {
        nameNodes.push(<div key={key} className={styles.horizontalBar}>
            {key}
            <button onClick={(e) => addToList(shuffle(value))}>Play</button>
        </div>);
    }
    return <>
        <div className={styles.horizontalBar}>
            Artists
            {artistNodes}
        </div>
        <div className={styles.horizontalBar}>
            Albums
            {albumNodes}
        </div>
    </>;
};

function groupBy<K, V>(items: V[], grouper: (arg0: V) => K): Map<K, V[]> {
    const result = new Map<K, V[]>();
    items.forEach(item => {
        const key = grouper(item);
        const value = result.get(key) ?? [];
        value.push(item);
        result.set(key, value);
    })
    return result;
}

function shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--)
    {
        const n = Math.floor(Math.random() * (i+1));
        const toSwap = items.at(i);
        const other = items.at(n);
        items[i] = other;
        items[n] = toSwap;
    }
    return items;
}