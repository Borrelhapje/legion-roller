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
        <Searcher addToList={(file) => startTransition(() => { setPlaylist(file); setCurrent(0); })} files={files}></Searcher>
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
            return file.artist.toLowerCase().includes(search) || file.album.toLowerCase().includes(search) || file.name.toLowerCase().includes(search);
        });
        newFilter.sort();
        setFilteredFiles(newFilter);
    }, [search, files]);
    return <>
        <div>
            <label htmlFor='search'>Artist</label>
            <input type='text' id='searcj' value={search} onChange={(e) => startTransition(() => setSearch(e.target.value))}></input>
        </div>
        <div>
            <SearchResults songs={filteredFiles} addToList={addToList}></SearchResults>
        </div>
    </>
}

interface TreeNode {
    name: string,
    nodes: Map<string, TreeNode>,
    song?: Song
}

const recursiveAllSongs = (arg0: TreeNode) => { 
    const result: Song[] = [];
    if (arg0.song) {
        result.push(arg0.song);
    }
    for (const node of arg0.nodes.values()) {
        result.push(...recursiveAllSongs(node));
    }
    return result;
};

const SearchResults = ({ songs, addToList }: { songs: Song[], addToList: Adder }) => {
    const artists = useMemo(() => {
        const result: Map<string,TreeNode> = new Map();
        songs.forEach(s => {
            const artistNode = result.get(s.artist) ?? { name: s.artist, nodes: new Map<string, TreeNode>() };
            result.set(artistNode.name, artistNode);
            const albumNode = artistNode.nodes.get(s.album) ?? { name: s.album, nodes: new Map<string, TreeNode>() };
            artistNode.nodes.set(albumNode.name, albumNode);
            albumNode.nodes.set(s.name, { name: s.name, nodes: new Map(), song: s });
        });
        return result;
    }, [songs]);
    return <ul>
        <RenderTree node={{ name: '', nodes: artists }} addToList={addToList}/>
    </ul>;
};

const RenderTree = ({ node, addToList }: { node: TreeNode, addToList: Adder }) => {
    const [ulOpen, setUlOpen] = useState(false);
    useEffect(() => {
        setUlOpen(node.nodes.size <= 3);
    }, [node.nodes]);
    const list: TreeNode[] = [];
    for (const value of node.nodes.values()) {
        list.push(value);
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    return <li>
        <span className={list.length === 0 ? '' : styles.caret}
            onClick={(e) => setUlOpen(prev => !prev)}>
            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); addToList(shuffle(recursiveAllSongs(node))) }}>{node.name}</button>
        </span>
        <ul className={`${styles.nested} ${ulOpen ? styles.active : ''}`} >
            {list.map(node => <RenderTree node={node} addToList={addToList} />)}
        </ul>
    </li>
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