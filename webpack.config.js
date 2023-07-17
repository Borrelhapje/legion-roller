import HtmlWebpackPlugin from 'html-webpack-plugin';

export default {
    mode: 'production',
    entry: './src/index.tsx',
    output: {
        filename: 'bundle.js',
        path: '/workspaces/music/dist',
        clean: true
    },
    devServer: {
        proxy: {
            '/complete': {
                target: 'https://media.helderman.xyz',
                changeOrigin: true
            }
        }
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
    },
    plugins: [

        new HtmlWebpackPlugin({

            title: 'Music',

        }),

    ],
    module: {

        rules: [

            {

                test: /\.css$/i,

                use: ['style-loader', 'css-loader'],

            }, {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },

        ],

    },
    performance: {
        maxEntrypointSize: 512000,
        maxAssetSize: 512000
    }
};