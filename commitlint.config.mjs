const HEADER = /^(?:\[[A-Za-z]+\]|[a-z]+(?:\([^)]+\))?!?:)\s\S.*$/;

export default {
  plugins: [
    {
      rules: {
        'header-format': ({ header }) => [
          HEADER.test(header ?? ''),
          'header must be "type(scope): subject" (feat: x) or "[TYPE] subject" ([ADD] user CRUD)',
        ],
      },
    },
  ],
  rules: {
    'header-format': [2, 'always'],
    'header-max-length': [2, 'always', 100],
    'body-leading-blank': [2, 'always'],
  },
};
