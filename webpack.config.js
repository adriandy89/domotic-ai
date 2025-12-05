module.exports = function (options, webpack) {
    return {
        ...options,
        resolve: {
            ...options.resolve,
            extensionAlias: {
                '.js': ['.js', '.ts'],
                '.mjs': ['.mjs', '.mts'],
            },
        },
    };
};
