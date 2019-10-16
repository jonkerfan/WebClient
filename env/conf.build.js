const bindPrefix = (name) => `node_modules/${name}`;

module.exports = {
    externalFiles: {
        openpgp: ['openpgp/dist/lightweight/openpgp.min.js', 'openpgp/dist/compat/openpgp.min.js'].map(bindPrefix),
        openpgpElliptic: bindPrefix('openpgp/dist/lightweight/elliptic.min.js'),
        openpgpWorker: bindPrefix('openpgp/dist/lightweight/openpgp.worker.min.js'),
        formgenerator: bindPrefix('pt-formgenerator/dist'),
        list: ['.htaccess', 'manifest.json', 'robots.txt']
    },
    babel: {
        excludedFiles: ['mailparser.js'],
        includedNodeModules: [
            'asmcrypto.js',
            'pmcrypto',
            'proton-shared',
            'pm-srp',
            'get-random-values',
            'pt-formgenerator',
            'sieve.js',
            'angular-ui-codemirror'
        ]
    },
    vendor_files: {
        css: ['dropzone/dist/dropzone.css', 'awesomplete/awesomplete.css', 'pikaday/css/pikaday.css'].map(bindPrefix),

        fonts: ['components-font-awesome/fonts', 'text-security/dist/text-security-disc.*'].map(bindPrefix)
    }
};
