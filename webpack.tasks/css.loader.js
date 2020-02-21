const path = require('path');
const env = require('../env/config');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const postcssPlugins = [];

if (env.isDistRelease()) {
    postcssPlugins.push(require('autoprefixer')(env.AUTOPREFIXER_CONFIG));
}

const DESIGN_SYSTEM_THEME = /.*theme\.scss$/;

const getSassLoaders = () => {
    return [
        'css-loader',
        postcssPlugins.length
            ? {
                  loader: 'postcss-loader',
                  options: {
                      ident: 'postcss',
                      plugins: postcssPlugins
                  }
              }
            : undefined,
        {
            loader: 'string-replace-loader',
            query: {
                multiple: [
                    {
                        search: '#hostURL#',
                        replace: env.getHostURL()
                    },
                    {
                        search: '#hostURL2#',
                        replace: env.getHostURL(true)
                    }
                ]
            }
        },
        {
            loader: 'fast-sass-loader'
        }
    ].filter(Boolean);
};

const sassLoaders = getSassLoaders();

module.exports = [
    {
        test: /\.css$/,
        exclude: /node_modules/,
        use: [
            MiniCssExtractPlugin.loader,
            {
                loader: 'css-loader',
                options: {
                    importLoaders: 1,
                    minimize: env.isDistRelease()
                }
            }
        ]
    },
    {
        test: /\.scss$/,
        exclude: DESIGN_SYSTEM_THEME,
        use: ['css-hot-loader', MiniCssExtractPlugin.loader, ...sassLoaders],
        sideEffects: true
    },
    {
        test: DESIGN_SYSTEM_THEME,
        // Prevent loading the theme in <style>, we want to load it as a raw string
        use: [...sassLoaders]
    }
];
