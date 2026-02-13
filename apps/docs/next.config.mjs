import nextra from 'nextra'

const withNextra = nextra({
  // Nextra v4 configuration
})

export default withNextra({
  output: 'export',
  images: {
    unoptimized: true,
  },
})
