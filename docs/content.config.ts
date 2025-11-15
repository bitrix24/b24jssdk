import { z } from 'zod'
import { defineCollection } from '@nuxt/content'

// const Image = z.object({
//   src: z.string(),
//   alt: z.string().optional(),
//   width: z.number().optional(),
//   height: z.number().optional()
// })

const Avatar = z.object({
  src: z.string(),
  alt: z.string().optional()
})

const Button = z.object({
  label: z.string(),
  iconName: z.string().optional(),
  avatar: Avatar.optional(),
  trailingIcon: z.string().optional(),
  to: z.string().optional(),
  target: z.enum(['_blank', '_self']).optional(),
  color: z.enum(['air-primary', 'air-primary-success', 'air-primary-alert', 'air-primary-copilot', 'air-secondary', 'air-secondary-alert', 'air-secondary-accent', 'air-secondary-accent-1', 'air-secondary-accent-2', 'air-secondary-no-accent', 'air-tertiary', 'air-tertiary-accent', 'air-tertiary-no-accent', 'air-selection', 'air-boost']).optional(),
  size: z.enum(['xss', 'xs', 'sm', 'md', 'lg', 'xl']).optional(),
  id: z.string().optional(),
  class: z.string().optional()
})

const PageFeature = z.object({
  title: z.string(),
  description: z.string().optional(),
  iconName: z.string(),
  to: z.string().optional(),
  target: z.enum(['_blank', '_self']).optional()
})

const PageHero = z.object({
  title: z.string(),
  description: z.string(),
  links: z.array(Button).optional()
})

const PageSection = z.object({
  title: z.string(),
  description: z.string(),
  iconName: z.string().optional(),
  links: z.array(Button).optional(),
  features: z.array(PageFeature).optional()
})

const Page = z.object({
  title: z.string(),
  description: z.string(),
  hero: PageHero
})

export const collections = {
  docs: defineCollection({
    type: 'page',
    source: [{
      include: 'docs/**/*'
    }],
    schema: z.object({
      badge: z.string().optional(),
      navigation: z.object({
        title: z.string().optional()
      }),
      links: z.array(Button)
    })
  }),
  index: defineCollection({
    type: 'page',
    source: 'index.yml',
    schema: Page.extend({
      hero: PageHero.extend({
        features: z.array(PageFeature)
      }),
      features: z.array(PageFeature),
      design_system: PageSection.extend({
        code: z.string()
      }),
      css_variables: PageSection.extend({
        code: z.string()
      }),
      components: PageSection.extend({
        code: z.string()
      }),
      templates: PageSection,
      community: PageSection
    })
  })
}
