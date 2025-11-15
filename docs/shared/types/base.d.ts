export type InfoIconData = {
  name?: null | string
  category: string
  subCategories: string[]
  dateFix?: null | string
}

export type InfoIconRow = {
  code: string
  name: string
  type: string
  icon: string
  specialized?: {
    animateSpin?: boolean
    animateSpinNormal?: boolean
    stroke?: 'stroke-bold' | 'stroke-normal' | 'stroke-thin'
    width?: 'auto' | 'w-lg' | 'w-[21px]'
    height?: 'auto' | 'h-lg' | 'h-[21px]'
  }
  data: InfoIconData
}

export type GroupRow = {
  code: string
  name: string
  list: InfoIconRow[]
}
